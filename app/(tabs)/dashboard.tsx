import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import * as ImagePicker from 'expo-image-picker'; // ✅ เพิ่ม ImagePicker
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Image,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { API_BASE } from '../../constants/config';
import { useAuth } from '../_layout';

const PRIMARY_COLOR = '#4e54c8';
const SECONDARY_COLOR = '#8f94fb';

export default function DashboardScreen() {
    const { user } = useAuth();
    const router = useRouter();
    
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [uploading, setUploading] = useState(false); // ✅ สถานะกำลังอัปโหลดรูป
    
    // Data States
    const [stats, setStats] = useState({ total: 0, won: 0, follow: 0, expense: 0 });
    const [recentList, setRecentList] = useState<any[]>([]);
    const [statusBreakdown, setStatusBreakdown] = useState<any[]>([]);
    
    const [userAvatar, setUserAvatar] = useState<string | null>(null); 
    const [timestamp, setTimestamp] = useState(new Date().getTime()); // ✅ ใช้แก้ Cache รูป

    // Load Data
    const fetchDashboardData = async () => {
        if (!user?.fullname) return;
        
        try {
            // 1. ดึง Stats
            const url = `${API_BASE}/api_mobile.php?action=get_dashboard_stats&filter_name=${user.fullname}`;
            const res = await axios.get(url);

            if (res.data) {
                setStats({
                    total: res.data.summary?.total || 0,
                    expense: res.data.summary?.expense || 0,
                    won: 0, 
                    follow: 0
                });
                setStatusBreakdown(res.data.breakdown || []);
                setRecentList(res.data.recent || []);
            }

            // 2. ดึงรูปโปรไฟล์ล่าสุด
            if (user?.username) {
                const profileRes = await axios.get(`${API_BASE}/api_mobile.php?action=get_user_profile&username=${user.username}`);
                if (profileRes.data?.avatar) {
                    setUserAvatar(profileRes.data.avatar);
                }
            }

        } catch (error) {
            console.error("Dashboard Fetch Error:", error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        fetchDashboardData();
    }, [user]);

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        fetchDashboardData();
    }, []);

    // ✅ 1. ฟังก์ชันเลือกรูป (กดที่รูปโปรไฟล์)
    const pickImage = async () => {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert('ขออภัย', 'ต้องการสิทธิ์เข้าถึงรูปภาพเพื่อเปลี่ยนโปรไฟล์');
            return;
        }

        let result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.5,
        });

        if (!result.canceled) {
            handleUploadProfile(result.assets[0].uri);
        }
    };

    // ✅ 2. ฟังก์ชันอัปโหลดรูป
    const handleUploadProfile = async (uri: string) => {
        setUploading(true);
        const formData = new FormData();
        
        const filename = uri.split('/').pop();
        const match = /\.(\w+)$/.exec(filename || '');
        const type = match ? `image/${match[1]}` : `image`;

        // @ts-ignore
        formData.append('avatar', { uri, name: filename, type });
        formData.append('username', user?.username || '');

        try {
            const res = await axios.post(`${API_BASE}/api_mobile.php?action=update_profile`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });

            if (res.data.status === 'success') {
                Alert.alert("สำเร็จ", "เปลี่ยนรูปโปรไฟล์เรียบร้อย");
                setTimestamp(new Date().getTime()); // รีเฟรชรูปทันที
                fetchDashboardData(); // โหลดข้อมูลใหม่
            } else {
                Alert.alert("ล้มเหลว", res.data.message || "อัปโหลดไม่สำเร็จ");
            }
        } catch (error) {
            Alert.alert("ข้อผิดพลาด", "ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์");
        } finally {
            setUploading(false);
        }
    };

    // Helper: สร้าง URL รูปภาพ
    const getAvatarUrl = () => {
        if (!userAvatar) return null;
        let baseUrl = API_BASE.replace('/api_mobile.php', '').replace('api_mobile.php', '');
        if (!baseUrl.endsWith('/')) baseUrl += '/';
        return `${baseUrl}uploads/profiles/${userAvatar}?t=${timestamp}`; // ใส่ timestamp กัน Cache
    };

    const getStatusConfig = (statusName: string) => {
        switch (statusName) {
            case 'ได้งาน': return { color: '#00b894', bg: '#d4edda', icon: 'trophy' };
            case 'เข้าเสนอโครงการ': return { color: '#3498db', bg: '#d6eaf8', icon: 'briefcase' };
            case 'กำลังติดตาม': return { color: '#f39c12', bg: '#fff3cd', icon: 'hourglass' };
            case 'ไม่ได้งาน': return { color: '#e74c3c', bg: '#f8d7da', icon: 'close-circle' };
            default: return { color: '#6c5ce7', bg: '#e0dcfc', icon: 'bookmark' };
        }
    };

    // Components
    const StatCard = ({ label, value, icon, color, delay }: any) => (
        <Animated.View entering={FadeInUp.delay(delay).duration(600)} style={styles.statWrapper}>
            <View style={[styles.statCard, { borderLeftColor: color }]}>
                <View style={[styles.statIconBox, { backgroundColor: color + '15' }]}>
                    <Ionicons name={icon} size={22} color={color} />
                </View>
                <View>
                    <Text style={styles.statValue}>{value}</Text>
                    <Text style={styles.statLabel}>{label}</Text>
                </View>
            </View>
        </Animated.View>
    );

    const RecentItem = ({ item, index }: any) => {
        const config = getStatusConfig(item.job_status);
        return (
            <Animated.View entering={FadeInDown.delay(index * 100).duration(500)}>
                <View style={styles.recentItem}>
                    <View style={[styles.statusIndicator, { backgroundColor: config.color }]} />
                    <View style={styles.recentContent}>
                        <Text style={styles.recentTitle} numberOfLines={1}>{item.project_name || item.work_result}</Text>
                        <Text style={styles.recentDate}>
                            <Ionicons name="calendar-outline" size={12} /> {new Date(item.report_date).toLocaleDateString('th-TH')}
                        </Text>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: config.bg }]}>
                        <Text style={{ color: config.color, fontSize: 10, fontWeight: 'bold' }}>{item.job_status}</Text>
                    </View>
                </View>
            </Animated.View>
        );
    };

    return (
        <View style={styles.container}>
            {/* Header Background */}
            <LinearGradient colors={[PRIMARY_COLOR, SECONDARY_COLOR]} style={styles.headerBackground}>
                <SafeAreaView edges={['top']} style={styles.headerContent}>
                    
                    {/* ✅ ส่วนแสดงโปรไฟล์ + เปลี่ยนรูป */}
                    <View style={styles.profileRow}>
                        
                        <TouchableOpacity onPress={pickImage} disabled={uploading} style={styles.avatarWrapper}>
                            <View style={styles.avatarContainer}>
                                {uploading ? (
                                    <ActivityIndicator size="small" color={PRIMARY_COLOR} />
                                ) : userAvatar ? (
                                    <Image source={{ uri: getAvatarUrl()! }} style={styles.avatarImage} />
                                ) : (
                                    <View style={styles.avatarPlaceholder}>
                                        <Ionicons name="person" size={24} color={PRIMARY_COLOR} />
                                    </View>
                                )}
                            </View>
                            {/* ไอคอนกล้องเล็กๆ เพื่อสื่อว่าเปลี่ยนรูปได้ */}
                            <View style={styles.cameraBadge}>
                                <Ionicons name="camera" size={12} color="white" />
                            </View>
                        </TouchableOpacity>
                        
                        <View style={styles.profileInfo}>
                            <Text style={styles.usernameText}>{user?.fullname || 'พนักงาน'}</Text>
                            <View style={styles.roleBadge}>
                                <Ionicons name="id-card-outline" size={12} color="white" style={{marginRight:4}}/>
                                <Text style={styles.roleText}>
                                    {user?.role === 'manager' ? 'ผู้บริหาร (Manager)' : 'พนักงาน (Staff)'}
                                </Text>
                            </View>
                        </View>
                    </View>

                </SafeAreaView>
            </LinearGradient>

            <View style={styles.bodyContainer}>
                <ScrollView 
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{ paddingBottom: 100 }}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={PRIMARY_COLOR}/>}
                >
                    {/* ❌ ลบปุ่มลงบันทึกงานออกแล้ว ตามคำขอ */}

                    {/* 📊 My Stats */}
                    <Text style={styles.sectionTitle}>ผลงานของฉัน</Text>
                    <View style={styles.statsGrid}>
                        <StatCard label="งานทั้งหมด" value={stats.total} icon="documents" color="#4e54c8" delay={0} />
                        <StatCard label="ยอดเบิกจ่าย" value={`฿${(stats.expense/1000).toFixed(1)}k`} icon="wallet" color="#8e44ad" delay={100} />
                        
                        {statusBreakdown.map((item, index) => {
                            const config = getStatusConfig(item.status);
                            return (
                                <StatCard 
                                    key={index}
                                    label={item.status} 
                                    value={item.count} 
                                    icon={config.icon} 
                                    color={config.color} 
                                    delay={200 + (index * 50)} 
                                />
                            );
                        })}
                    </View>

                    {/* 📋 Recent Activity */}
                    <View style={styles.recentSection}>
                        <View style={styles.sectionHeader}>
                            <Text style={styles.sectionTitle}>รายการล่าสุด</Text>
                            <TouchableOpacity onPress={() => router.push('/(tabs)/history')}>
                                <Text style={styles.seeAllText}>ดูทั้งหมด</Text>
                            </TouchableOpacity>
                        </View>

                        {loading ? (
                            <ActivityIndicator color={PRIMARY_COLOR} style={{marginTop:20}} />
                        ) : recentList.length > 0 ? (
                            recentList.slice(0, 5).map((item, index) => (
                                <RecentItem key={index} item={item} index={index} />
                            ))
                        ) : (
                            <View style={styles.emptyState}>
                                <Text style={{color:'#999'}}>ยังไม่มีรายการบันทึก</Text>
                            </View>
                        )}
                    </View>

                </ScrollView>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f8f9fd' },
    
    // Header
    headerBackground: { height: 160, borderBottomLeftRadius: 30, borderBottomRightRadius: 30, paddingHorizontal: 20 },
    headerContent: { justifyContent: 'center', height: '100%', paddingBottom: 20 },
    
    profileRow: { flexDirection: 'row', alignItems: 'center' },
    
    // Avatar Styles
    avatarWrapper: { position: 'relative', marginRight: 15 },
    avatarContainer: { width: 70, height: 70, borderRadius: 35, borderWidth: 2, borderColor: 'rgba(255,255,255,0.8)', justifyContent:'center', alignItems:'center', backgroundColor:'white' },
    avatarImage: { width: '100%', height: '100%', borderRadius: 35 },
    avatarPlaceholder: { width: '100%', height: '100%', borderRadius: 35, backgroundColor: 'white', justifyContent: 'center', alignItems: 'center' },
    cameraBadge: { position: 'absolute', bottom: 0, right: 0, backgroundColor: '#2ecc71', width: 24, height: 24, borderRadius: 12, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: 'white' },

    profileInfo: { flex: 1 },
    usernameText: { color: 'white', fontSize: 22, fontWeight: 'bold', marginBottom: 4 },
    roleBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.2)', alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
    roleText: { color: 'white', fontSize: 13, fontWeight: '500' },

    // Body
    bodyContainer: { flex: 1, marginTop: -20 }, // ขยับขึ้นเล็กน้อยเพราะไม่มีปุ่ม Action แล้ว

    // Stats Grid
    sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#2d3436', marginLeft: 20, marginBottom: 10, marginTop: 20 },
    statsGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 15 },
    statWrapper: { width: '50%', padding: 5 },
    statCard: { backgroundColor: 'white', borderRadius: 15, padding: 15, flexDirection: 'row', alignItems: 'center', elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5, borderLeftWidth: 4 },
    statIconBox: { width: 35, height: 35, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginRight: 10 },
    statValue: { fontSize: 18, fontWeight: 'bold', color: '#2d3436' },
    statLabel: { fontSize: 12, color: '#636e72' },

    // Recent List
    recentSection: { marginTop: 10, paddingHorizontal: 20 },
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
    seeAllText: { color: PRIMARY_COLOR, fontWeight: 'bold', fontSize: 13 },
    
    recentItem: { backgroundColor: 'white', padding: 15, borderRadius: 12, marginBottom: 10, flexDirection: 'row', alignItems: 'center', elevation: 1 },
    statusIndicator: { width: 4, height: 40, borderRadius: 2, marginRight: 15 },
    recentContent: { flex: 1 },
    recentTitle: { fontSize: 14, fontWeight: 'bold', color: '#2d3436', marginBottom: 2 },
    recentDate: { fontSize: 12, color: '#b2bec3' },
    statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
    
    emptyState: { alignItems: 'center', padding: 20 },
});