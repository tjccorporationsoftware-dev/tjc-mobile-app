import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    Image,
    KeyboardAvoidingView, Platform,
    StatusBar,
    StyleSheet, Text,
    TextInput, TouchableOpacity,
    View
} from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { useAuth } from './_layout';

// ✅ 1. Import ตัวแปร URL จากไฟล์ Config (ตรวจสอบ path ให้ถูกว่าไฟล์อยู่ไหน)
// ถ้าไฟล์ constants อยู่คนละโฟลเดอร์ ให้แก้ path เช่น '../constants/config'
import { API_BASE } from '../constants/config';

const { width } = Dimensions.get('window');
const PRIMARY_COLOR = '#4e54c8';
const SECONDARY_COLOR = '#8f94fb';

export default function LoginScreen() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    
    const { signIn } = useAuth(); 
    const router = useRouter();

    const handleLogin = async () => {
        if (!username || !password) {
            Alert.alert('แจ้งเตือน', 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน');
            return;
        }

        setLoading(true);
        console.log("🚀 กำลังเชื่อมต่อ:", `${API_BASE}/api_mobile.php?action=login`);

        try {
            // ✅ 2. ยิง API ไปที่ Server ของเรา
            const response = await fetch(`${API_BASE}/api_mobile.php?action=login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    username: username,
                    password: password
                }),
            });

            // ✅ 3. อ่านค่าเป็น Text ก่อน (เผื่อ Server ส่ง HTML Error มา)
            const textResponse = await response.text();
            console.log("📩 Server ตอบกลับ:", textResponse); // ดู Log นี้สำคัญมาก!

            // แปลงเป็น JSON
            let json;
            try {
                json = JSON.parse(textResponse);
            } catch (e) {
                // ถ้าแปลงไม่ได้ แสดงว่าติดหน้า HTML (Anti-bot ของ InfinityFree)
                Alert.alert('Connection Error', 'Server ส่งข้อมูลผิดพลาด (อาจติด Firewall หรือ URL ผิด)');
                setLoading(false);
                return;
            }
            
            // ✅ 4. ตรวจสอบสถานะการล็อกอิน
            if (json.status === 'success') {
                console.log("✅ Login สำเร็จ:", json.user);
                
                // ส่งข้อมูลผู้ใช้ไปเก็บใน Context (Global State)
                // สมมติว่าฟังก์ชัน signIn ของคุณรับ object user ได้
                // ถ้า signIn ของคุณรับแค่ username/pass ให้แก้ตรงนี้ตามความเหมาะสม
                signIn(json.user); 
                
                // ไปหน้า Dashboard
                router.replace('/(tabs)/dashboard');
            } else {
                Alert.alert('เข้าสู่ระบบไม่สำเร็จ', json.message || 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
            }

        } catch (error) {
            console.error("❌ Network Error:", error);
            Alert.alert('Error', 'เกิดข้อผิดพลาดในการเชื่อมต่อ (เช็คเน็ต หรือ URL)');
        } finally {
            setLoading(false);
        }
    };

    return (
        <KeyboardAvoidingView 
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.container}
        >
            <StatusBar barStyle="light-content" />
            
            <LinearGradient
                colors={[PRIMARY_COLOR, '#c471ed', '#f64f59']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.background}
            >
                <View style={styles.logoContainer}>
                    <Animated.View entering={FadeInDown.delay(200).duration(1000).springify()} style={styles.iconCircle}>
                        <Image 
                            source={require('../assets/images/LogoTJC.png')} 
                            style={{ width: 80, height: 80, resizeMode: 'contain' }} 
                        />
                    </Animated.View>
                    
                    <Animated.View entering={FadeInDown.delay(400).duration(1000).springify()}>
                        <Text style={styles.appName}>TJC corporation</Text>
                        <Text style={styles.welcomeText}>ระบบรายงานการปฏิบัติงาน</Text>
                    </Animated.View>
                </View>

                <Animated.View 
                    entering={FadeInUp.delay(600).duration(1000).springify()} 
                    style={styles.formContainer}
                >
                    <Text style={styles.loginTitle}>Welcome Back!</Text>

                    <View style={styles.inputWrapper}>
                        <Ionicons name="person-outline" size={20} color="#666" style={styles.inputIcon} />
                        <TextInput
                            style={styles.input}
                            placeholder="Username"
                            placeholderTextColor="#aaa"
                            value={username}
                            onChangeText={setUsername}
                            autoCapitalize="none"
                        />
                    </View>

                    <View style={styles.inputWrapper}>
                        <Ionicons name="lock-closed-outline" size={20} color="#666" style={styles.inputIcon} />
                        <TextInput
                            style={styles.input}
                            placeholder="Password"
                            placeholderTextColor="#aaa"
                            value={password}
                            onChangeText={setPassword}
                            secureTextEntry={!showPassword}
                        />
                        <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                            <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color="#aaa" />
                        </TouchableOpacity>
                    </View>

                    <TouchableOpacity style={{alignSelf: 'flex-end', marginBottom: 25}}>
                        <Text style={styles.forgotPass}>Forgot Password?</Text>
                    </TouchableOpacity>

                    <TouchableOpacity onPress={handleLogin} disabled={loading} activeOpacity={0.8}>
                        <LinearGradient
                            colors={[PRIMARY_COLOR, SECONDARY_COLOR]}
                            style={styles.loginButton}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                        >
                            {loading ? (
                                <ActivityIndicator color="white" />
                            ) : (
                                <Text style={styles.loginButtonText}>LOGIN</Text>
                            )}
                        </LinearGradient>
                    </TouchableOpacity>

                    <View style={styles.footer}>
                        <Text style={styles.footerText}>TJC Engineering Service Co., Ltd.</Text>
                    </View>

                </Animated.View>
            </LinearGradient>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    background: { flex: 1, justifyContent: 'center' },
    
    logoContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 40 },
    iconCircle: {
        width: 110, height: 110, borderRadius: 55, backgroundColor: 'white',
        justifyContent: 'center', alignItems: 'center', marginBottom: 15,
        shadowColor: "#000", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.3, shadowRadius: 20, elevation: 10
    },
    appName: { fontSize: 28, fontWeight: '900', color: 'white', letterSpacing: 2 },
    welcomeText: { fontSize: 14, color: 'rgba(255,255,255,0.9)', marginTop: 5, fontWeight: '500' },

    formContainer: {
        backgroundColor: 'white',
        borderTopLeftRadius: 30, borderTopRightRadius: 30,
        paddingHorizontal: 30, paddingTop: 40, paddingBottom: 50,
        width: width,
        shadowColor: "#000", shadowOffset: { width: 0, height: -10 }, shadowOpacity: 0.1, shadowRadius: 20, elevation: 15
    },
    loginTitle: { fontSize: 24, fontWeight: 'bold', color: '#333', marginBottom: 30 },
    
    inputWrapper: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: '#f8f9fa', borderRadius: 15, paddingHorizontal: 15,
        marginBottom: 15, height: 55,
        borderWidth: 1, borderColor: '#eee'
    },
    inputIcon: { marginRight: 15 },
    input: { flex: 1, fontSize: 16, color: '#333', height: '100%' },
    
    forgotPass: { color: '#888', fontSize: 13, fontWeight: '600' },

    loginButton: {
        borderRadius: 15, paddingVertical: 16, alignItems: 'center', justifyContent: 'center',
        shadowColor: PRIMARY_COLOR, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 10, elevation: 8,
        marginTop: 10
    },
    loginButtonText: { color: 'white', fontSize: 16, fontWeight: 'bold', letterSpacing: 1 },

    footer: { marginTop: 40, alignItems: 'center' },
    footerText: { color: '#ccc', fontSize: 11, fontWeight: '600' }
});