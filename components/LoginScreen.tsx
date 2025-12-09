// ไฟล์: components/LoginScreen.tsx

import axios from 'axios';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { API_BASE } from '../constants/config';

// กำหนดหน้าตาข้อมูล User
export interface UserData {
    status: 'success';
    id: number;
    username: string;
    fullname: string;
    role: 'manager' | 'staff';
}

interface LoginScreenProps {
    onLoginSuccess: (data: UserData) => void;
}

export default function LoginScreen({ onLoginSuccess }: LoginScreenProps) {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);

    const handleLogin = async () => {
        if (!username || !password) return Alert.alert('เตือน', 'กรุณากรอกข้อมูลให้ครบ');
        setLoading(true);
        try {
            const response = await axios.post(`${API_BASE}/api_mobile.php?action=login`, { username, password });
            if (response.data.status === 'success') {
                onLoginSuccess(response.data);
            } else {
                Alert.alert('เข้าระบบไม่ได้', response.data.message || 'ข้อมูลไม่ถูกต้อง');
            }
        } catch (error) {
            Alert.alert('Error', 'เชื่อมต่อ Server ไม่ได้ กรุณาเช็ค IP');
        } finally {
            setLoading(false);
        }
    };

    return (
        <View style={styles.container}>
            <View style={styles.card}>
                <Text style={styles.header}>🔐 TJC System</Text>
                <TextInput 
                    style={styles.input} 
                    placeholder="Username" 
                    value={username} 
                    onChangeText={setUsername} 
                    autoCapitalize="none" 
                />
                <TextInput 
                    style={styles.input} 
                    placeholder="Password" 
                    value={password} 
                    onChangeText={setPassword} 
                    secureTextEntry 
                />
                <TouchableOpacity style={styles.btn} onPress={handleLogin} disabled={loading}>
                    {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>เข้าสู่ระบบ</Text>}
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f5f5' },
    card: { width: '85%', backgroundColor: 'white', padding: 25, borderRadius: 10, elevation: 5 },
    header: { fontSize: 22, fontWeight: 'bold', marginBottom: 20, textAlign: 'center', color: '#333' },
    input: { borderWidth: 1, borderColor: '#ddd', padding: 12, borderRadius: 5, marginBottom: 15, backgroundColor: '#fff' },
    btn: { backgroundColor: '#4e54c8', padding: 15, borderRadius: 5, alignItems: 'center' },
    btnText: { color: 'white', fontWeight: 'bold' }
});