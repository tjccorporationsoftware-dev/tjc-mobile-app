import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Image,
    Linking,
    Platform,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { API_BASE } from '../../constants/config';
import { useAuth } from '../_layout';

const PRIMARY_COLOR = '#4e54c8';
const SECONDARY_COLOR = '#8f94fb';

export default function ProfileScreen() {
    const { user, signOut } = useAuth();
    const router = useRouter();
    
    const [refreshing, setRefreshing] = useState(false);
    const [uploading, setUploading] = useState(false);
    
    // --- State ข้อมูลโปรไฟล์ ---
    const [userAvatar, setUserAvatar] = useState<string | null>(null); 
    const [timestamp, setTimestamp] = useState(new Date().getTime());
    const [displayName, setDisplayName] = useState(user?.fullname || 'พนักงาน');
    const [displayRole, setDisplayRole] = useState(user?.role || 'staff');

    // ฟังก์ชันดึงข้อมูล Profile
    const fetchProfileData = async () => {
        if (!user?.username) return;
        
        try {
            const urlProfile = `${API_BASE}/api_mobile.php?action=get_user_profile&username=${user.username}`;
            const resProfile = await axios.get(urlProfile);
            
            if (resProfile.data) {
                if (resProfile.data.fullname) setDisplayName(resProfile.data.fullname);
                if (resProfile.data.role) setDisplayRole(resProfile.data.role);
                
                if (resProfile.data.avatar) {
                    if (resProfile.data.avatar !== userAvatar) {
                        setUserAvatar(resProfile.data.avatar);
                        setTimestamp(new Date().getTime());
                    }
                }
            }
        } catch (error) {
            console.error("Profile Fetch Error:", error);
        } finally {
            setRefreshing(false);
        }
    };

    useFocusEffect(
        useCallback(() => {
            if (user?.username) {
                fetchProfileData();
            }
        }, [user?.username])
    );

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        if (user?.username) fetchProfileData();
    }, [user?.username]);

    // ✅✅✅ แก้ไขใหม่: ถามก่อนทำอย่างอื่น ✅✅✅
    const pickImage = async () => {
        // 1. ขอสิทธิ์ทันทีที่กดปุ่ม (Force Request)
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();

        // 2. เช็คผลลัพธ์ทันที
        if (status !== 'granted') {
            // ถ้าลูกค้ากดปฏิเสธ (Don't Allow)
            Alert.alert(
                'ต้องการสิทธิ์เข้าถึงรูปภาพ',
                'กรุณาเปิดสิทธิ์ในการตั้งค่าเพื่อเปลี่ยนรูปโปรไฟล์',
                [
                    { text: 'ยกเลิก', style: 'cancel' },
                    { text: 'ไปตั้งค่า', onPress: () => Linking.openSettings() }
                ]
            );
            // 🛑 หยุดการทำงานตรงนี้เลย ไม่เปิดอัลบั้ม ไม่อัปโหลด
            return; 
        }

        // 3. ถ้าได้สิทธิ์แล้ว ค่อยเปิดอัลบั้ม
        try {
            let result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images, 
                allowsEditing: true, 
                aspect: [1, 1], 
                quality: 0.7, 
            });

            // 4. ถ้าลูกค้าเลือกรูปเสร็จแล้ว (ไม่กด cancel) ค่อยเรียกฟังก์ชันอัปโหลด
            if (!result.canceled) {
                handleUploadProfile(result.assets[0].uri);
            }
        } catch (error) {
            console.log("Error launching picker:", error);
        }
    };

    const handleUploadProfile = async (uri: string) => {
        if (!user?.username) {
            Alert.alert("ข้อผิดพลาด", "ไม่พบข้อมูลผู้ใช้ กรุณาล็อกอินใหม่");
            return;
        }

        setUploading(true);
        const formData = new FormData();

        let filename = uri.split('/').pop();
        let match = /\.(\w+)$/.exec(filename || '');
        let type = match ? `image/${match[1]}` : `image/jpeg`; 

        // @ts-ignore
        formData.append('avatar', {
            uri: Platform.OS === 'android' ? uri : uri.replace('file://', ''),
            name: filename || `profile_${new Date().getTime()}.jpg`,
            type: type,
        });
        formData.append('username', user.username);

        try {
            const res = await axios.post(`${API_BASE}/api_mobile.php?action=update_profile`, formData, {
                headers: { 'Accept': 'application/json' },
                transformRequest: (data) => data,
            });

            if (res.data.status === 'success') {
                Alert.alert("สำเร็จ", "เปลี่ยนรูปโปรไฟล์เรียบร้อย");
                
                const newTime = new Date().getTime();
                setTimestamp(newTime);
                
                if (res.data.avatar) {
                    setUserAvatar(res.data.avatar);
                } else {
                    setUserAvatar(filename || null);
                }
                
                fetchProfileData();
            } else {
                Alert.alert("ล้มเหลว", res.data.message || "อัปโหลดไม่สำเร็จ");
            }
        } catch (error) {
            console.log("Upload Error:", error);
            Alert.alert("ข้อผิดพลาด", "ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์");
        } finally {
            setUploading(false);
        }
    };

    const getAvatarUrl = () => {
        const avatarFile = userAvatar || user?.avatar;
        if (!avatarFile) return null;
        
        if (avatarFile.startsWith('http')) return avatarFile;

        let baseUrl = API_BASE.replace('/api_mobile.php', '').replace('api_mobile.php', '');
        if (!baseUrl.endsWith('/')) baseUrl += '/';
        return `${baseUrl}uploads/profiles/${avatarFile}?t=${timestamp}`;
    };

    const handleLogout = () => {
        Alert.alert(
            "ออกจากระบบ",
            "คุณต้องการออกจากระบบใช่หรือไม่?",
            [
                { text: "ยกเลิก", style: "cancel" },
                { 
                    text: "ยืนยัน", 
                    style: "destructive", 
                    onPress: () => { if (signOut) signOut(); }
                }
            ]
        );
    };

    const ProfileItem = ({ icon, label, value, isLast = false }: any) => (
        <View style={[styles.infoItem, isLast && { borderBottomWidth: 0 }]}>
            <View style={styles.iconContainer}>
                <Ionicons name={icon} size={22} color={PRIMARY_COLOR} />
            </View>
            <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>{label}</Text>
                <Text style={styles.infoValue}>{value}</Text>
            </View>
        </View>
    );

    return (
        <View style={styles.container}>
            <LinearGradient colors={[PRIMARY_COLOR, SECONDARY_COLOR]} style={styles.headerBackground}>
                <SafeAreaView edges={['top']} style={styles.headerContent}>
                    <View style={styles.profileHeaderCenter}>
                        <TouchableOpacity onPress={pickImage} disabled={uploading} style={styles.avatarWrapperBig}>
                            <View style={styles.avatarContainerBig}>
                                {uploading ? (
                                    <ActivityIndicator size="small" color={PRIMARY_COLOR} />
                                ) : getAvatarUrl() ? (
                                    <Image 
                                        source={{ uri: getAvatarUrl()! }} 
                                        style={styles.avatarImage} 
                                        key={timestamp}
                                    />
                                ) : (
                                    <View style={styles.avatarPlaceholder}>
                                        <Ionicons name="person" size={45} color={PRIMARY_COLOR} />
                                    </View>
                                )}
                            </View>
                            <View style={styles.cameraBadgeBig}>
                                <Ionicons name="camera" size={16} color="white" />
                            </View>
                        </TouchableOpacity>
                        
                        <Text style={styles.usernameTextBig}>{displayName}</Text>
                        <View style={styles.roleBadge}>
                            <Ionicons name="shield-checkmark" size={14} color="white" style={{marginRight:6}}/>
                            <Text style={styles.roleText}>
                                {displayRole?.toUpperCase()}
                            </Text>
                        </View>
                    </View>
                </SafeAreaView>
            </LinearGradient>

            <View style={styles.bodyContainer}>
                <ScrollView 
                    showsVerticalScrollIndicator={false}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={PRIMARY_COLOR}/>}
                    contentContainerStyle={{ padding: 20, paddingBottom: 50 }}
                >
                    <View style={styles.infoCard}>
                        <Text style={styles.cardHeader}>ข้อมูลส่วนตัว</Text>
                        <ProfileItem icon="person-circle-outline" label="ชื่อผู้ใช้งาน (Username)" value={user?.username || '-'} />
                        <ProfileItem icon="id-card-outline" label="ชื่อ-นามสกุล" value={displayName} />
                        <ProfileItem icon="briefcase-outline" label="ตำแหน่งงาน" value={displayRole} isLast />
                    </View>

                    <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
                        <View style={styles.logoutIconBg}>
                            <Ionicons name="log-out" size={20} color="#e74c3c" />
                        </View>
                        <Text style={styles.logoutText}>ออกจากระบบ</Text>
                    </TouchableOpacity>

                    <Text style={styles.versionText}>Application Version 1.0.0</Text>

                </ScrollView>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f4f6f9' },
    headerBackground: { height: 300, borderBottomLeftRadius: 40, borderBottomRightRadius: 40 },
    headerContent: { alignItems: 'center', paddingTop: 20 },
    profileHeaderCenter: { alignItems: 'center' },
    avatarWrapperBig: { position: 'relative', marginBottom: 15, elevation: 10, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: {width:0, height:5} },
    avatarContainerBig: { width: 110, height: 110, borderRadius: 55, borderWidth: 4, borderColor: 'white', justifyContent:'center', alignItems:'center', backgroundColor:'white' },
    avatarImage: { width: '100%', height: '100%', borderRadius: 55 },
    avatarPlaceholder: { width: '100%', height: '100%', borderRadius: 55, backgroundColor: '#f0f2f5', justifyContent: 'center', alignItems: 'center' },
    cameraBadgeBig: { position: 'absolute', bottom: 5, right: 5, backgroundColor: '#2ecc71', width: 34, height: 34, borderRadius: 17, justifyContent: 'center', alignItems: 'center', borderWidth: 3, borderColor: 'white' },
    usernameTextBig: { color: 'white', fontSize: 26, fontWeight: 'bold', marginBottom: 10, textShadowColor: 'rgba(0,0,0,0.1)', textShadowOffset: {width:0, height:1}, textShadowRadius:2 },
    roleBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 25, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' },
    roleText: { color: 'white', fontSize: 14, fontWeight: '600', letterSpacing: 0.5 },
    bodyContainer: { flex: 1, marginTop: -50 }, 
    infoCard: { backgroundColor: 'white', borderRadius: 20, paddingVertical: 10, elevation: 4, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, marginBottom: 20 },
    cardHeader: { fontSize: 18, fontWeight: 'bold', color: '#2d3436', marginLeft: 20, marginTop: 15, marginBottom: 10 },
    infoItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: '#f5f6fa' },
    iconContainer: { width: 45, height: 45, borderRadius: 12, backgroundColor: '#f0f3ff', justifyContent: 'center', alignItems: 'center', marginRight: 15 },
    infoContent: { flex: 1 },
    infoLabel: { fontSize: 13, color: '#636e72', marginBottom: 4 },
    infoValue: { fontSize: 16, color: '#2d3436', fontWeight: '600' },
    logoutButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: 'white', padding: 16, borderRadius: 20, marginTop: 5, elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5 },
    logoutIconBg: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#ffecec', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
    logoutText: { color: '#e74c3c', fontWeight: 'bold', fontSize: 16 },
    versionText: { textAlign: 'center', color: '#b2bec3', marginTop: 30, fontSize: 12 }
});