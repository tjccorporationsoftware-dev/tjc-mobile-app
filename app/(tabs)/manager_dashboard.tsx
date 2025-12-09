import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import axios from 'axios';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Linking,
    Modal,
    Platform,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

// ✅ Import จากไฟล์ Config กลาง (ถูกต้องตามหลักการ)
import { API_BASE, IMG_BASE_URL } from '../../constants/config';

import { useAuth } from '../_layout';

const PRIMARY_COLOR = '#4e54c8';

export default function ManagerDashboardScreen() {
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    
    // Data States
    const [summary, setSummary] = useState({ total: 0, expense: 0 });
    const [kpiList, setKpiList] = useState<any[]>([]); 
    const [recentList, setRecentList] = useState<any[]>([]);

    // Filter States
    const [userList, setUserList] = useState<string[]>([]);
    const [selectedUser, setSelectedUser] = useState('');
    const [startDate, setStartDate] = useState<Date | null>(null);
    const [endDate, setEndDate] = useState<Date | null>(null);
    
    // UI States
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [dateField, setDateField] = useState<'start' | 'end'>('start');
    const [tempDate, setTempDate] = useState(new Date());
    const [showUserModal, setShowUserModal] = useState(false);
    const [modalVisible, setModalVisible] = useState(false);
    const [selectedItem, setSelectedItem] = useState<any>(null);

    // Initial Load (Dropdown Users)
    useEffect(() => {
        axios.get(`${API_BASE}/api_mobile.php?action=get_users`, { timeout: 10000 })
            .then(res => { if(Array.isArray(res.data)) setUserList(res.data); })
            .catch(err => console.log("User load error:", err.message));
    }, []);

    // Main Fetch Function
    const fetchDashboard = async () => {
        try {
            console.log("Fetching from:", API_BASE); 

            let url = `${API_BASE}/api_mobile.php?action=get_dashboard_stats`;
            
            const formatDate = (date: Date) => {
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const day = String(date.getDate()).padStart(2, '0');
                return `${year}-${month}-${day}`;
            };

            if (selectedUser) url += `&filter_name=${selectedUser}`;
            if (startDate) url += `&start_date=${formatDate(startDate)}`;
            if (endDate) url += `&end_date=${formatDate(endDate)}`;

            const res = await axios.get(url, { timeout: 10000 });
            
            if (res.data) {
                setSummary(res.data.summary || { total: 0, expense: 0 });
                setKpiList(Array.isArray(res.data.breakdown) ? res.data.breakdown : []);
                setRecentList(Array.isArray(res.data.recent) ? res.data.recent : []);
            }
        } catch (error) {
            console.error("Fetch Error:", error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useFocusEffect(useCallback(() => { fetchDashboard(); }, []));

    const onSearch = () => { setLoading(true); fetchDashboard(); };
    const onReset = () => {
        setSelectedUser(''); setStartDate(null); setEndDate(null);
        setTimeout(() => { setLoading(true); fetchDashboard(); }, 100);
    };

    // ✅ ฟังก์ชันเปิดรูป (ใช้ IMG_BASE_URL จาก Config)
    const openImage = (filename: string) => { 
        if (!filename) return;

        // ไม่ต้อง replace หรือ hardcode IP แล้ว ใช้ตัวแปรกลางได้เลย
        const fullUrl = `${IMG_BASE_URL}${filename}`;
        
        console.log("Opening Receipt:", fullUrl);

        Linking.canOpenURL(fullUrl).then(supported => {
            if (supported) {
                Linking.openURL(fullUrl);
            } else {
                Alert.alert("แจ้งเตือน", "ไม่สามารถเปิดลิงก์นี้ได้");
            }
        }).catch(err => console.error("An error occurred", err));
    };

    const openDetailModal = (item: any) => { setSelectedItem(item); setModalVisible(true); };

    // Date Picker Logic
    const openDatePicker = (field: 'start' | 'end') => {
        setDateField(field);
        setTempDate(field === 'start' ? (startDate || new Date()) : (endDate || new Date()));
        setShowDatePicker(true);
    };
    
    const onDateChangeAndroid = (event: any, selectedDate?: Date) => {
        setShowDatePicker(false);
        if (event.type === 'set' && selectedDate) {
            if (dateField === 'start') setStartDate(selectedDate);
            else setEndDate(selectedDate);
        }
    };

    const confirmDateIOS = () => {
        setShowDatePicker(false);
        if (dateField === 'start') setStartDate(tempDate);
        else setEndDate(tempDate);
    };

    const getStatusConfig = (statusName: string) => {
        switch (statusName) {
            case 'ได้งาน': return { colors: ['#00b894', '#55efc4'], icon: 'trophy' };
            case 'เข้าเสนอโครงการ': return { colors: ['#3498db', '#2980b9'], icon: 'briefcase' };
            case 'กำลังติดตาม': return { colors: ['#f39c12', '#f1c40f'], icon: 'hourglass' };
            case 'ไม่ได้งาน': return { colors: ['#e74c3c', '#c0392b'], icon: 'close-circle' };
            default: return { colors: ['#6c5ce7', '#a29bfe'], icon: 'bookmark' }; 
        }
    };

    // Sub-Components
    const KpiCard = ({ label, value, icon, colors, delay }: any) => (
        <Animated.View entering={FadeInUp.delay(delay).duration(600)} style={styles.kpiWrapper}>
            <LinearGradient colors={colors} style={styles.kpiCard} start={{x:0, y:0}} end={{x:1, y:1}}>
                <View style={styles.kpiHeader}>
                    <Text style={styles.kpiLabel} numberOfLines={1}>{label}</Text>
                    <Ionicons name={icon} size={18} color="rgba(255,255,255,0.8)" />
                </View>
                <Text style={styles.kpiValue}>{value}</Text>
            </LinearGradient>
        </Animated.View>
    );

    const renderItem = ({ item, index }: { item: any, index: number }) => {
        const config = getStatusConfig(item.job_status);
        const statusColor = config.colors[0];
        
        return (
            <Animated.View entering={FadeInDown.delay(index * 100).duration(500)}>
                <View style={[styles.card, { borderLeftColor: statusColor }]}>
                    <View style={styles.cardHeader}>
                        <View style={{flexDirection:'row', alignItems:'center'}}>
                            <View style={styles.avatar}><Text style={{fontSize:16}}>👤</Text></View>
                            <View style={{marginLeft: 10}}>
                                <Text style={styles.reporterName}>{item.reporter_name}</Text>
                                <Text style={styles.dateText}>{new Date(item.report_date).toLocaleDateString('th-TH')}</Text>
                            </View>
                        </View>
                        <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
                            <Ionicons name={config.icon as any} size={12} color={statusColor} style={{marginRight:4}} />
                            <Text style={{ color: statusColor, fontWeight: 'bold', fontSize: 11 }}>{item.job_status}</Text>
                        </View>
                    </View>

                    <View style={styles.cardBody}>
                        <Text style={styles.projectTitle} numberOfLines={1}>{item.project_name || '(ไม่ระบุโครงการ)'}</Text>
                        <View style={styles.infoRow}>
                            <Ionicons name="business-outline" size={16} color="#666" style={{marginRight:6}}/>
                            <Text style={styles.clientText} numberOfLines={1}>{item.work_result}</Text>
                        </View>
                    </View>

                    <View style={styles.cardFooter}>
                        <TouchableOpacity onPress={() => openDetailModal(item)} style={styles.btnDetail}>
                            <Text style={{ color: PRIMARY_COLOR, fontWeight: 'bold', fontSize: 13 }}>ดูรายละเอียด</Text>
                            <Ionicons name="arrow-forward" size={14} color={PRIMARY_COLOR} style={{marginLeft:4}}/>
                        </TouchableOpacity>

                        {parseFloat(item.total_expense) > 0 && (
                            <View style={styles.priceTag}>
                                <Text style={{ color: '#e74c3c', fontWeight: 'bold', fontSize: 12 }}>฿ {parseInt(item.total_expense).toLocaleString()}</Text>
                            </View>
                        )}
                    </View>
                </View>
            </Animated.View>
        );
    };

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            <View style={styles.header}>
                <Text style={styles.headerTitle}>📊 ภาพรวมผู้บริหาร</Text>
            </View>

            <View style={styles.filterSection}>
                <TouchableOpacity onPress={() => setShowUserModal(true)} style={styles.userFilterBtn}>
                    <Ionicons name="person-circle-outline" size={24} color={PRIMARY_COLOR} />
                    <Text style={styles.filterText} numberOfLines={1}>{selectedUser ? selectedUser : 'พนักงานทั้งหมด'}</Text>
                    <Ionicons name="chevron-down" size={16} color="#999" />
                </TouchableOpacity>

                <View style={styles.dateFilterRow}>
                    <TouchableOpacity onPress={() => openDatePicker('start')} style={styles.dateBtn}>
                        <Text style={styles.dateBtnText}>{startDate ? startDate.toLocaleDateString('th-TH', {day:'2-digit', month:'short'}) : 'วันที่เริ่ม'}</Text>
                    </TouchableOpacity>
                    <Ionicons name="arrow-forward" size={14} color="#ccc" />
                    <TouchableOpacity onPress={() => openDatePicker('end')} style={styles.dateBtn}>
                        <Text style={styles.dateBtnText}>{endDate ? endDate.toLocaleDateString('th-TH', {day:'2-digit', month:'short'}) : 'สิ้นสุด'}</Text>
                    </TouchableOpacity>
                    
                    <View style={{flexDirection:'row', gap:5}}>
                        <TouchableOpacity onPress={onSearch} style={styles.searchBtn}><Ionicons name="search" size={18} color="white" /></TouchableOpacity>
                        <TouchableOpacity onPress={onReset} style={styles.resetBtn}><Ionicons name="refresh" size={18} color="#666" /></TouchableOpacity>
                    </View>
                </View>
            </View>

            {loading ? <ActivityIndicator size="large" color={PRIMARY_COLOR} style={{marginTop: 50}} /> : 
            <FlatList
                data={recentList}
                keyExtractor={(item) => item.id.toString()}
                renderItem={renderItem}
                contentContainerStyle={{ paddingBottom: 20, paddingTop: 10 }}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={fetchDashboard} />}
                ListHeaderComponent={
                    <View style={styles.kpiContainer}>
                        <View style={styles.kpiRow}>
                            <KpiCard label="ทั้งหมด" value={summary.total} icon="documents" colors={['#4e54c8', '#8f94fb']} delay={0} />
                            <KpiCard label="ยอดจ่าย" value={summary.expense ? (summary.expense / 1000).toFixed(1) + 'k' : '0'} icon="wallet" colors={['#9b59b6', '#8e44ad']} delay={100} />
                        </View>
                        
                        <View style={styles.dynamicGrid}>
                            {Array.isArray(kpiList) && kpiList.map((item, index) => {
                                const config = getStatusConfig(item.status);
                                return (
                                    <View key={index} style={styles.gridItem}>
                                        <KpiCard label={item.status} value={item.count} icon={config.icon} colors={config.colors} delay={200 + (index * 50)} />
                                    </View>
                                );
                            })}
                        </View>

                        <Text style={styles.sectionTitle}>📋 รายการล่าสุด ({recentList.length})</Text>
                    </View>
                }
                ListEmptyComponent={<View style={styles.emptyState}><Ionicons name="folder-open-outline" size={50} color="#ccc"/><Text style={{color:'#999', marginTop:10}}>ไม่พบข้อมูลตามเงื่อนไข</Text></View>}
            />}

            {/* Modals */}
            <Modal visible={showUserModal} transparent={true} animationType="fade" onRequestClose={() => setShowUserModal(false)}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>เลือกพนักงาน</Text>
                        <ScrollView style={{maxHeight: 300, width: '100%'}}>
                            <TouchableOpacity onPress={() => { setSelectedUser(''); setShowUserModal(false); }} style={styles.modalItem}>
                                <Text style={{fontWeight: 'bold', color: PRIMARY_COLOR}}>-- ดูทั้งหมด --</Text>
                            </TouchableOpacity>
                            {userList.map((name, index) => (
                                <TouchableOpacity key={index} onPress={() => { setSelectedUser(name); setShowUserModal(false); }} style={styles.modalItem}>
                                    <Text style={{fontSize:16, color:'#333'}}>{name}</Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                        <TouchableOpacity onPress={() => setShowUserModal(false)} style={styles.closeBtn}><Text style={{color:'white'}}>ปิด</Text></TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {showDatePicker && (Platform.OS === 'ios' ? (
                <Modal transparent={true} animationType="fade"><View style={styles.modalOverlay}><View style={[styles.modalContent, {width: '80%', alignItems:'center'}]}><DateTimePicker value={tempDate} mode="date" display="inline" onChange={(e, d) => d && setTempDate(d)} /><TouchableOpacity onPress={confirmDateIOS} style={styles.closeBtn}><Text style={{color:'white', fontWeight:'bold'}}>ตกลง</Text></TouchableOpacity></View></View></Modal>
            ) : (<DateTimePicker value={dateField === 'start' ? (startDate || new Date()) : (endDate || new Date())} mode="date" display="default" onChange={onDateChangeAndroid} />))}

            {/* Detail Modal */}
            <Modal visible={modalVisible} transparent={true} animationType="slide" onRequestClose={() => setModalVisible(false)}>
                <View style={styles.detailModalOverlay}>
                    <View style={styles.detailModalContent}>
                        <View style={styles.detailHeader}>
                            <Text style={styles.detailTitle}>รายละเอียด</Text>
                            <TouchableOpacity onPress={() => setModalVisible(false)}><Ionicons name="close" size={24} color="#999"/></TouchableOpacity>
                        </View>
                        <ScrollView style={{maxHeight: 500}}>
                            {selectedItem && (
                                <View style={{paddingBottom:20}}>
                                    <DetailItem icon="alert-circle" color="#e74c3c" title="ปัญหาที่พบ" text={selectedItem.problem} />
                                    <DetailItem icon="bulb" color="#f39c12" title="ข้อเสนอแนะ" text={selectedItem.suggestion} />
                                    <DetailItem icon="document-text" color={PRIMARY_COLOR} title="บันทึกเพิ่มเติม" text={selectedItem.additional_notes} />
                                    
                                    <Text style={styles.imgHeader}>📸 หลักฐาน / ใบเสร็จ</Text>
                                    <View style={{flexDirection:'row', gap:15, marginTop:10}}>
                                        {/* ✅ ปุ่มดูรูป ใช้ openImage ที่ดึงค่าจาก Config */}
                                        {selectedItem.fuel_receipt && <ImageButton icon="gas-station" color="#e74c3c" label="น้ำมัน" onPress={()=>openImage(selectedItem.fuel_receipt)} />}
                                        {selectedItem.accommodation_receipt && <ImageButton icon="bed" color="#3498db" label="ที่พัก" onPress={()=>openImage(selectedItem.accommodation_receipt)} />}
                                        {selectedItem.other_receipt && <ImageButton icon="dots-horizontal-circle" color="#9b59b6" label="อื่นๆ" onPress={()=>openImage(selectedItem.other_receipt)} />}
                                        {!selectedItem.fuel_receipt && !selectedItem.accommodation_receipt && !selectedItem.other_receipt && <Text style={{color:'#999', fontSize:13}}>ไม่มีรูปภาพ</Text>}
                                    </View>
                                </View>
                            )}
                        </ScrollView>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

// Sub-components
const DetailItem = ({icon, color, title, text}: any) => (
    <View style={{marginBottom: 15}}>
        <View style={{flexDirection:'row', alignItems:'center', marginBottom:5}}>
            <Ionicons name={icon} size={18} color={color} style={{marginRight:5}} />
            <Text style={{fontWeight:'bold', color:'#333'}}>{title}</Text>
        </View>
        <Text style={{color:'#555', paddingLeft:23, lineHeight:20}}>{text || '-'}</Text>
    </View>
);

const ImageButton = ({icon, color, label, onPress}: any) => (
    <TouchableOpacity onPress={onPress} style={{alignItems:'center'}}>
        <View style={{width:45, height:45, borderRadius:12, backgroundColor:color+'15', justifyContent:'center', alignItems:'center', marginBottom:5}}>
            <MaterialCommunityIcons name={icon} size={22} color={color} />
        </View>
        <Text style={{fontSize:11, color:'#666'}}>{label}</Text>
    </TouchableOpacity>
);

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f8f9fd' },
    header: { padding: 15, paddingBottom: 10, backgroundColor:'white' },
    headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#2d3436' },

    filterSection: { padding: 15, backgroundColor: 'white', borderBottomLeftRadius: 20, borderBottomRightRadius: 20, shadowColor:'#000', shadowOpacity:0.05, shadowRadius:10, elevation:3, zIndex:10 },
    userFilterBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f0f2f5', padding: 10, borderRadius: 12, marginBottom: 10 },
    filterText: { flex: 1, marginLeft: 10, fontSize: 14, color: '#333', fontWeight: '500' },
    dateFilterRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    dateBtn: { flex: 1, backgroundColor: '#f0f2f5', padding: 10, borderRadius: 10, alignItems: 'center' },
    dateBtnText: { fontSize: 13, color: '#555' },
    searchBtn: { backgroundColor: PRIMARY_COLOR, width: 40, height: 40, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
    resetBtn: { backgroundColor: '#e0e0e0', width: 40, height: 40, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },

    kpiContainer: { paddingHorizontal: 15, marginTop: 15 },
    kpiRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
    dynamicGrid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -5 },
    gridItem: { width: '50%', padding: 5, marginBottom: 5 },

    kpiWrapper: { flex: 1 },
    kpiCard: { padding: 15, borderRadius: 15, height: 80, justifyContent: 'space-between', elevation: 3 },
    kpiHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    kpiLabel: { color: 'white', fontSize: 12, fontWeight: 'bold', opacity: 0.9 },
    kpiValue: { color: 'white', fontSize: 22, fontWeight: 'bold' },

    sectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#444', marginTop: 15, marginBottom: 10 },

    card: { backgroundColor: 'white', marginHorizontal: 15, marginBottom: 12, borderRadius: 15, padding: 15, borderLeftWidth: 5, elevation: 2, shadowColor:'#000', shadowOpacity:0.05, shadowRadius:5 },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
    avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#f0f2f5', justifyContent: 'center', alignItems: 'center' },
    reporterName: { fontSize: 14, fontWeight: 'bold', color: '#333' },
    dateText: { fontSize: 11, color: '#888' },
    statusBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
    
    cardBody: { paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#f0f0f0', marginBottom: 10 },
    projectTitle: { fontSize: 15, fontWeight: 'bold', color: '#2c3e50', marginBottom: 5 },
    infoRow: { flexDirection: 'row', alignItems: 'center', marginTop: 3 },
    clientText: { fontSize: 13, color: '#555', flex: 1 },
    infoText: { fontSize: 12, color: '#888' },

    cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    btnDetail: { flexDirection: 'row', alignItems: 'center' },
    priceTag: { backgroundColor: '#fff5f5', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, borderWidth: 1, borderColor: '#ffccd0' },

    emptyState: { alignItems: 'center', marginTop: 50 },

    modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)' },
    modalContent: { backgroundColor: 'white', padding: 20, borderRadius: 15, width: '85%', maxHeight: '70%' },
    modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 15, color: PRIMARY_COLOR, textAlign: 'center' },
    modalItem: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f0f0f0', width: '100%', alignItems: 'center' },
    closeBtn: { marginTop: 15, backgroundColor: PRIMARY_COLOR, padding: 12, borderRadius: 10, width: '100%', alignItems: 'center' },

    detailModalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
    detailModalContent: { backgroundColor: 'white', borderTopLeftRadius: 25, borderTopRightRadius: 25, padding: 25, maxHeight: '85%' },
    detailHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    detailTitle: { fontSize: 20, fontWeight: 'bold', color: '#333' },
    imgHeader: { fontSize: 15, fontWeight: 'bold', color: '#333', marginTop: 10 },
});