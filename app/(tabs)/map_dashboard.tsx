import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import axios from 'axios';
import React, { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Dimensions, Image,
    Modal,
    Platform,
    ScrollView,
    StyleSheet, Text,
    TouchableOpacity,
    View
} from 'react-native';
import MapView, { Callout, Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';
import { API_BASE } from '../../constants/config';

const { width, height } = Dimensions.get('window');

// สีหลัก
const COLOR_PRIMARY = '#4e54c8';
const COLOR_SECONDARY = '#8f94fb';
const COLOR_RESET = '#95a5a6';

export default function MapDashboardScreen() {
    const mapRef = useRef<MapView>(null);
    const [markers, setMarkers] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    
    // --- Helper: หา "วันที่ 1" ของเดือนปัจจุบัน ---
    const getFirstDayOfMonth = () => {
        const date = new Date();
        return new Date(date.getFullYear(), date.getMonth(), 1);
    };

    // Filter States
    // 🚩 FIX 1: เริ่มต้นวันที่ 1 ของเดือน เพื่อให้เห็นข้อมูลย้อนหลัง
    const [startDate, setStartDate] = useState<Date | null>(getFirstDayOfMonth()); 
    const [endDate, setEndDate] = useState<Date | null>(new Date());     // ถึงวันนี้
    
    const [userList, setUserList] = useState<string[]>([]);
    const [selectedUser, setSelectedUser] = useState('');
    const [showUserDropdown, setShowUserDropdown] = useState(false);

    // Date Picker UI
    const [showPicker, setShowPicker] = useState(false);
    const [pickerMode, setPickerMode] = useState<'start'|'end'>('start');
    const [tempDate, setTempDate] = useState(new Date());

    const [timestamp] = useState(new Date().getTime());

    // --- Helper Functions ---
    const formatDateForDisplay = (date: Date | null) => {
        if (!date) return "วว/ดด/ปปปป";
        const buddhistYear = date.getFullYear() + 543;
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        return `${day}/${month}/${buddhistYear}`;
    };

    const formatDateForAPI = (date: Date | null) => {
        if (!date) return ""; 
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    // 1. Initial Load
    useEffect(() => {
        const fetchUsers = async () => {
            try {
                const res = await axios.get(`${API_BASE}/api_mobile.php?action=get_users`);
                if (Array.isArray(res.data)) setUserList(res.data);
            } catch (error) { console.error("Error fetching users:", error); }
        };
        fetchUsers();
        fetchMapData(); // Load initial data
    }, []);

    // 2. Main Fetch Function
    const fetchMapData = async () => {
        if (startDate && endDate && startDate.getTime() > endDate.getTime()) {
            Alert.alert('ข้อผิดพลาด', 'วันที่เริ่มต้นต้องมาก่อนวันที่สิ้นสุด');
            return;
        }
        
        setLoading(true);
        try {
            const startStr = formatDateForAPI(startDate);
            const endStr = formatDateForAPI(endDate);
            
            let url = `${API_BASE}/api_mobile.php?action=get_map_data&start_date=${startStr}&end_date=${endStr}`;
            if (selectedUser) url += `&filter_name=${selectedUser}`;
            
            // 🚩 FIX 2: Debug Logs (ดูค่าใน Terminal)
            console.log("--------------------------------");
            console.log("📍 Fetching URL:", url);

            const res = await axios.get(url);
            
            // console.log("📦 API Response:", JSON.stringify(res.data, null, 2)); // เปิดบรรทัดนี้ถ้าอยากเห็นข้อมูลดิบ

            if (Array.isArray(res.data)) {
                // 🚩 FIX 3: กรองข้อมูลที่ไม่มี Lat/Lng ออกก่อน เพื่อกัน Map Error
                const validMarkers = res.data.filter((m: any) => 
                    m.lat && m.lng && !isNaN(parseFloat(m.lat)) && parseFloat(m.lat) !== 0
                );

                console.log(`✅ Valid Markers: ${validMarkers.length} / ${res.data.length}`);

                setMarkers(validMarkers);
                
                // Auto Zoom
                setTimeout(() => {
                    if (validMarkers.length > 0 && mapRef.current) {
                        const coordinates = validMarkers.map((m: any) => ({
                            latitude: parseFloat(m.lat),
                            longitude: parseFloat(m.lng),
                        }));
                        mapRef.current.fitToCoordinates(coordinates, {
                            edgePadding: { top: 280, right: 50, bottom: 50, left: 50 },
                            animated: true,
                        });
                    }
                }, 800);
            } else {
                console.log("⚠️ API did not return an array");
                setMarkers([]);
            }
        } catch (error) { 
            console.error('❌ API Error:', error);
            Alert.alert("ข้อผิดพลาด", "ไม่สามารถโหลดข้อมูลได้");
        } 
        finally { 
            setLoading(false); 
        }
    };

    // Auto fetch when user changes
    useEffect(() => { fetchMapData(); }, [selectedUser]);

    // Button Handlers
    const handleSearch = () => {
        setShowUserDropdown(false);
        fetchMapData(); 
    }
    
    const handleReset = () => {
        setSelectedUser('');
        setStartDate(getFirstDayOfMonth()); // Reset กลับไปเป็นต้นเดือน
        setEndDate(new Date());
        setShowUserDropdown(false);
        setTimeout(() => fetchMapData(), 100); 
    };

    const handleToday = () => {
        const today = new Date();
        setStartDate(today);
        setEndDate(today);
        // User needs to click Search to apply or call fetchMapData() immediately if preferred
    };

    // --- Date Picker Logic ---
    const openDatePicker = (mode: 'start' | 'end') => {
        setPickerMode(mode);
        const initialDate = mode === 'start' ? (startDate || new Date()) : (endDate || new Date());
        setTempDate(initialDate);
        setShowPicker(true);
    };

    const onDateChange = (event: any, selectedDate?: Date) => {
        if (Platform.OS === 'android') {
            setShowPicker(false);
            if (event.type === 'set' && selectedDate) {
                if (pickerMode === 'start') setStartDate(selectedDate);
                else setEndDate(selectedDate);
            }
        } else {
            if (selectedDate) setTempDate(selectedDate);
        }
    };

    const confirmDateIOS = () => {
        setShowPicker(false);
        if (pickerMode === 'start') setStartDate(tempDate);
        else setEndDate(tempDate);
    };

    // Helpers
    const getPinColor = (status: string) => {
        if (status === 'ได้งาน') return '#2ecc71';
        if (status === 'เข้าเสนอโครงการ') return '#3498db';
        if (status === 'กำลังติดตาม') return '#f1c40f';
        return '#e74c3c';
    };

    const getAvatarUrl = (filename: string) => {
        if (!filename) return null;
        let baseUrl = API_BASE.replace('/api_mobile.php', '').replace('api_mobile.php', '');
        if (!baseUrl.endsWith('/')) baseUrl += '/';
        return `${baseUrl}uploads/profiles/${filename}?t=${timestamp}`;
    };

    return (
        <View style={styles.container}>
            {/* 1. แผนที่ */}
            <MapView
                ref={mapRef}
                style={StyleSheet.absoluteFillObject}
                provider={PROVIDER_GOOGLE}
                initialRegion={{
                    latitude: 13.7563, longitude: 100.5018, latitudeDelta: 10, longitudeDelta: 10,
                }}
            >
                {markers.map((marker) => {
                    const color = getPinColor(marker.status);
                    const avatarUri = getAvatarUrl(marker.avatar);

                    return (
                        <Marker 
                            key={marker.id ? marker.id.toString() : `marker-${Math.random()}`} 
                            coordinate={{ 
                                latitude: parseFloat(marker.lat), 
                                longitude: parseFloat(marker.lng) 
                            }}
                            tracksViewChanges={true}
                        >
                            <View style={styles.markerContainer}>
                                <View style={[styles.pinHead, { borderColor: color }]}>
                                    {avatarUri ? (
                                        <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
                                    ) : (
                                        <View style={[styles.placeholderAvatar, { backgroundColor: color }]}>
                                            <Ionicons name="person" size={16} color="white" />
                                        </View>
                                    )}
                                </View>
                                <View style={[styles.pinArrow, { borderTopColor: color }]} />
                                <View style={styles.nameLabel}>
                                    <Text style={styles.nameText} numberOfLines={1}>{marker.name}</Text>
                                </View>
                            </View>

                            <Callout tooltip>
                                <View style={styles.calloutBubble}>
                                    <View style={styles.calloutHeader}>
                                        <Text style={styles.calloutTitle}>{marker.name}</Text>
                                        <Text style={styles.calloutRole}>({marker.position})</Text>
                                    </View>
                                    <View style={styles.divider} />
                                    <Text style={styles.rowText}>🏢 <Text style={{fontWeight:'bold'}}>{marker.client}</Text></Text>
                                    <Text style={styles.rowText}>📂 {marker.project || '-'}</Text>
                                    <View style={styles.divider} />
                                    <View style={styles.statusRow}>
                                        <Text style={[styles.statusText, {color: color}]}>● {marker.status}</Text>
                                        <Text style={styles.dateText}>📅 {marker.date}</Text>
                                    </View>
                                </View>
                                <View style={styles.arrowBorder} />
                                <View style={styles.arrow} />
                            </Callout>
                        </Marker>
                    );
                })}
            </MapView>

            {/* 2. Filter Bar */}
            <SafeAreaView style={styles.topControlContainer} pointerEvents="box-none">
                <View style={styles.filterCard}>
                    
                    {/* เลือกพนักงาน */}
                    <View style={{zIndex: 2000, marginBottom: 8}}>
                        <TouchableOpacity 
                            style={styles.inputBox} 
                            onPress={() => setShowUserDropdown(!showUserDropdown)}
                            activeOpacity={0.8}
                        >
                            <Text style={[styles.inputText, !selectedUser && {color:'#666'}]}>
                                {selectedUser || "พนักงานทั้งหมด"}
                            </Text>
                            <Ionicons name="chevron-down" size={20} color="#666" />
                        </TouchableOpacity>

                        {showUserDropdown && (
                            <View style={styles.dropdownList}>
                                <ScrollView style={{maxHeight: 200}} nestedScrollEnabled={true}>
                                    <TouchableOpacity style={styles.dropdownItem} onPress={() => { setSelectedUser(''); setShowUserDropdown(false); }}>
                                        <Text style={{fontWeight:'bold', color: COLOR_PRIMARY}}>-- พนักงานทั้งหมด --</Text>
                                    </TouchableOpacity>
                                    {userList.map((u, i) => (
                                        <TouchableOpacity key={i} style={styles.dropdownItem} onPress={() => { setSelectedUser(u); setShowUserDropdown(false); }}>
                                            <Text>{u}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </ScrollView>
                            </View>
                        )}
                    </View>

                    {/* เลือกวันที่ */}
                    <View style={styles.actionRow}>
                        <TouchableOpacity onPress={() => openDatePicker('start')} style={styles.dateInput} activeOpacity={0.8}>
                            <Text style={[styles.dateTextSimple, !startDate && {color:'#999'}]}>
                                {formatDateForDisplay(startDate)}
                            </Text>
                            <Ionicons name="calendar-outline" size={20} color="#666" />
                        </TouchableOpacity>

                        <Ionicons name="arrow-forward" size={16} color="#ccc" style={{alignSelf:'center'}} />

                        <TouchableOpacity onPress={() => openDatePicker('end')} style={styles.dateInput} activeOpacity={0.8}>
                            <Text style={[styles.dateTextSimple, !endDate && {color:'#999'}]}>
                                {formatDateForDisplay(endDate)}
                            </Text>
                            <Ionicons name="calendar-outline" size={20} color="#666" />
                        </TouchableOpacity>
                    </View>

                    {/* ปุ่มกด */}
                    <View style={styles.buttonRow}>
                         <TouchableOpacity onPress={handleSearch} style={[styles.btn, {backgroundColor: COLOR_PRIMARY, flex: 2}]}>
                            <Ionicons name="search" size={18} color="white" />
                            <Text style={styles.btnText}>ค้นหา</Text>
                        </TouchableOpacity>

                        <TouchableOpacity onPress={handleToday} style={[styles.btn, {backgroundColor: '#f0f8ff', borderColor: COLOR_PRIMARY, borderWidth:1, flex: 1}]}>
                             <Text style={[styles.btnText, {color: COLOR_PRIMARY}]}>วันนี้</Text>
                        </TouchableOpacity>

                        <TouchableOpacity onPress={handleReset} style={[styles.btn, {backgroundColor: COLOR_RESET, flex: 1}]}>
                            <Ionicons name="refresh" size={18} color="white" />
                        </TouchableOpacity>
                    </View>
                    
                    <Text style={styles.resultText}>พบข้อมูลที่แสดงผลได้ {markers.length} รายการ</Text>

                </View>
            </SafeAreaView>

            {/* Date Picker */}
            {showPicker && (
                Platform.OS === 'ios' ? (
                    <Modal transparent={true} animationType="fade">
                        <View style={styles.modalOverlay}>
                            <View style={styles.iosPickerContainer}>
                                <Text style={styles.pickerTitle}>
                                    {pickerMode === 'start' ? 'วันที่เริ่มต้น' : 'ถึงวันที่'}
                                </Text>
                                <DateTimePicker 
                                    value={tempDate}
                                    mode="date"
                                    display="inline"
                                    locale="th-TH"
                                    onChange={onDateChange}
                                    style={{ marginHorizontal: 10 }}
                                />
                                <View style={{flexDirection:'row', borderTopWidth:1, borderColor:'#eee'}}>
                                    <TouchableOpacity onPress={()=>setShowPicker(false)} style={[styles.iosPickerBtn, {borderRightWidth:1, borderColor:'#eee'}]}>
                                        <Text style={{color:'#666'}}>ยกเลิก</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity onPress={confirmDateIOS} style={styles.iosPickerBtn}>
                                        <Text style={{color: COLOR_PRIMARY, fontWeight:'bold'}}>ตกลง</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        </View>
                    </Modal>
                ) : (
                    <DateTimePicker 
                        value={pickerMode === 'start' ? (startDate || new Date()) : (endDate || new Date())}
                        mode="date"
                        display="default"
                        onChange={onDateChange}
                    />
                )
            )}

            {loading && (
                <View style={styles.loadingOverlay}>
                    <ActivityIndicator size="small" color={COLOR_PRIMARY} />
                    <Text style={{marginLeft: 10, color: COLOR_PRIMARY}}>กำลังโหลด...</Text>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#fff' },
    
    topControlContainer: { 
        position: 'absolute', top: 0, width: '100%', 
        zIndex: 100, padding: 10 
    },
    filterCard: { 
        backgroundColor: 'white', borderRadius: 10, padding: 15,
        shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10, elevation: 5
    },

    inputBox: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        borderWidth: 1, borderColor: '#ccc', borderRadius: 5, padding: 10, backgroundColor: '#fff'
    },
    inputText: { fontSize: 14, color: '#333', fontWeight:'bold' },
    
    dropdownList: {
        position: 'absolute', top: 45, left: 0, right: 0,
        backgroundColor: 'white', borderWidth: 1, borderColor: '#ccc', borderRadius: 5,
        maxHeight: 200, elevation: 10, shadowColor: '#000', shadowOpacity: 0.2, zIndex: 3000
    },
    dropdownItem: { padding: 12, borderBottomWidth: 1, borderBottomColor: '#eee' },

    actionRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
    dateInput: { 
        flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        borderWidth: 1, borderColor: '#ccc', borderRadius: 5, padding: 10 
    },
    dateTextSimple: { fontSize: 13, fontWeight: 'bold', color: '#333' },

    buttonRow: { flexDirection: 'row', gap: 10 },
    btn: { 
        flexDirection: 'row', justifyContent: 'center', alignItems: 'center', 
        padding: 10, borderRadius: 5 
    },
    btnText: { color: 'white', fontWeight: 'bold', marginLeft: 5 },

    resultText: { textAlign: 'center', fontSize: 12, color: '#666', marginTop: 10 },

    // Map Markers & Callouts
    markerContainer: { alignItems: 'center', width: 100 },
    pinHead: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, justifyContent: 'center', alignItems: 'center', backgroundColor: 'white', overflow: 'hidden' },
    avatarImage: { width: '100%', height: '100%' },
    placeholderAvatar: { width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' },
    pinArrow: { width: 0, height: 0, backgroundColor: 'transparent', borderStyle: 'solid', borderLeftWidth: 6, borderRightWidth: 6, borderTopWidth: 8, borderLeftColor: 'transparent', borderRightColor: 'transparent', marginTop: -1 },
    nameLabel: { backgroundColor: 'rgba(255,255,255,0.9)', paddingHorizontal: 6, borderRadius: 4, marginTop: 2, borderWidth: 1, borderColor: '#ccc' },
    nameText: { fontSize: 10, fontWeight: 'bold', color: '#333' },

    calloutBubble: { backgroundColor: 'white', padding: 10, borderRadius: 8, width: 220, marginBottom: 5 },
    calloutHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
    calloutTitle: { fontWeight: 'bold', fontSize: 14 },
    calloutRole: { fontSize: 11, color: '#666' },
    divider: { height: 1, backgroundColor: '#eee', marginVertical: 5 },
    rowText: { fontSize: 12, color: '#444', marginBottom: 2 },
    statusRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 5 },
    statusText: { fontSize: 11, fontWeight: 'bold' },
    dateText: { fontSize: 11, color: '#888' },
    arrowBorder: { alignSelf: 'center', borderTopColor: '#ccc', borderWidth: 10, borderLeftColor: 'transparent', borderRightColor: 'transparent', marginTop: -1 },
    arrow: { alignSelf: 'center', borderTopColor: 'white', borderWidth: 10, borderLeftColor: 'transparent', borderRightColor: 'transparent', marginTop: -21 },

    // Modal Picker
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
    iosPickerContainer: { backgroundColor: 'white', width: '90%', borderRadius: 15, overflow: 'hidden', paddingBottom: 0 },
    pickerTitle: { textAlign: 'center', padding: 15, fontWeight: 'bold', fontSize: 16, borderBottomWidth: 1, borderColor: '#eee', backgroundColor: '#f9f9f9' },
    iosPickerBtn: { flex: 1, padding: 15, alignItems: 'center', backgroundColor: 'white' },

    loadingOverlay: { position: 'absolute', bottom: 50, alignSelf: 'center', flexDirection: 'row', backgroundColor: 'white', padding: 10, borderRadius: 20, elevation: 5 }
});