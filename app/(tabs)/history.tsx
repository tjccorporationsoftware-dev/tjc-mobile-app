import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import axios from 'axios';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
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

import { API_BASE } from '../../constants/config';
import { useAuth } from '../_layout';

const PRIMARY_COLOR = '#4e54c8';
const SECONDARY_COLOR = '#8f94fb';
const COLOR_RESET = '#95a5a6';

// ตัวเลือกสถานะ
const FILTER_OPTIONS = ['ทั้งหมด', 'กำลังติดตาม', 'ได้งาน', 'เข้าเสนอโครงการ', 'ไม่ได้งาน'];

export default function HistoryScreen() {
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    // Data States
    const [historyList, setHistoryList] = useState<any[]>([]);
    const [summary, setSummary] = useState({ total: 0, expense: 0 });
    const [statusBreakdown, setStatusBreakdown] = useState<any[]>([]);

    // Filter States
    const [startDate, setStartDate] = useState<Date | null>(null);
    const [endDate, setEndDate] = useState<Date | null>(null);
    const [filterStatus, setFilterStatus] = useState('ทั้งหมด');

    // UI States
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [dateField, setDateField] = useState<'start' | 'end'>('start');
    const [tempDate, setTempDate] = useState(new Date());
    const [modalVisible, setModalVisible] = useState(false);
    const [selectedItem, setSelectedItem] = useState<any>(null);
    
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

    // Main Fetch Function
    const fetchHistory = async () => {
        if (!user?.fullname) return;

        if (startDate && endDate && startDate > endDate) {
            Alert.alert("ข้อผิดพลาด", "วันที่เริ่มต้นต้องมาก่อนวันที่สิ้นสุด");
            setLoading(false);
            return;
        }

        try {
            if (!refreshing && historyList.length === 0) setLoading(true);

            let url = `${API_BASE}/api_mobile.php?action=get_dashboard_stats`;
            
            // ✅ เข้ารหัสชื่อและสถานะให้ถูกต้อง
            url += `&filter_name=${encodeURIComponent(user.fullname)}`; 

            if (startDate) url += `&start_date=${formatDateForAPI(startDate)}`;
            if (endDate) url += `&end_date=${formatDateForAPI(endDate)}`;
            
            if (filterStatus !== 'ทั้งหมด') {
                url += `&status_filter=${encodeURIComponent(filterStatus)}`;
            }

            console.log("Fetching URL:", url); 

            const res = await axios.get(url);
            
            if (res.data) {
                setSummary(res.data.summary || { total: 0, expense: 0 });
                setStatusBreakdown(res.data.breakdown || []);
                setHistoryList(res.data.recent || []);
            }
        } catch (error) {
            console.error("Fetch Error:", error);
            Alert.alert("ข้อผิดพลาด", "ไม่สามารถโหลดข้อมูลได้");
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    // ✅ Client-Side Filtering (กรองซ้ำที่หน้าจอเพื่อความชัวร์)
    const displayedList = useMemo(() => {
        if (filterStatus === 'ทั้งหมด') return historyList;
        return historyList.filter(item => item.job_status === filterStatus);
    }, [historyList, filterStatus]);

    // โหลดใหม่เมื่อ filterStatus เปลี่ยน
    useEffect(() => {
        fetchHistory();
    }, [filterStatus]);

    useFocusEffect(useCallback(() => { fetchHistory(); }, [user]));

    // Button Handlers
    const handleSearch = () => { setLoading(true); fetchHistory(); };
    
    const handleReset = () => {
        setStartDate(null);
        setEndDate(null);
        setFilterStatus('ทั้งหมด'); 
        setTimeout(() => fetchHistory(), 100);
    };

    // Date Picker Logic
    const openDatePicker = (field: 'start' | 'end') => {
        setDateField(field);
        const currentDate = field === 'start' ? (startDate || new Date()) : (endDate || new Date());
        setTempDate(currentDate);
        setShowDatePicker(true);
    };

    const onDateChange = (event: any, selectedDate?: Date) => {
        if (Platform.OS === 'android') {
            setShowDatePicker(false);
            if (event.type === 'set' && selectedDate) {
                if (dateField === 'start') setStartDate(selectedDate);
                else setEndDate(selectedDate);
            }
        } else {
            if (selectedDate) setTempDate(selectedDate);
        }
    };

    const confirmDateIOS = () => {
        setShowDatePicker(false);
        if (dateField === 'start') setStartDate(tempDate);
        else setEndDate(tempDate);
    };

    // ✅ แก้ไขฟังก์ชันเปิดรูปภาพให้ URL สมบูรณ์
    const openImage = (filename: string) => { 
        if (!filename) return;

        // ลบ api_mobile.php ออก (ถ้ามี)
        let baseUrl = API_BASE.replace('api_mobile.php', '');
        
        // เติม / ถ้าไม่มี
        if (!baseUrl.endsWith('/')) {
            baseUrl += '/';
        }

        const fullUrl = `${baseUrl}uploads/${filename}`;
        console.log("Open Image:", fullUrl); // Debug URL
        Linking.openURL(fullUrl).catch(err => Alert.alert("ข้อผิดพลาด", "ไม่สามารถเปิดลิงก์รูปภาพได้")); 
    };
    
    const openDetailModal = (item: any) => { 
        setSelectedItem(item); 
        setModalVisible(true); 
    };

    const getStatusConfig = (statusName: string) => {
        switch (statusName) {
            case 'ได้งาน': return { colors: ['#00b894', '#55efc4'], icon: 'trophy', color: '#00b894', bg: '#d4edda' };
            case 'เข้าเสนอโครงการ': return { colors: ['#3498db', '#2980b9'], icon: 'briefcase', color: '#3498db', bg: '#d6eaf8' };
            case 'กำลังติดตาม': return { colors: ['#f39c12', '#f1c40f'], icon: 'hourglass', color: '#f39c12', bg: '#fff3cd' };
            case 'ไม่ได้งาน': return { colors: ['#e74c3c', '#c0392b'], icon: 'close-circle', color: '#e74c3c', bg: '#f8d7da' };
            default: return { colors: ['#6c5ce7', '#a29bfe'], icon: 'bookmark', color: '#6c5ce7', bg: '#e0dcfc' };
        }
    };

    // --- Sub Components ---
    const KpiCard = ({ label, value, icon, colors, delay }: any) => (
        <Animated.View entering={FadeInUp.delay(delay).duration(600)} style={styles.kpiWrapper}>
            <LinearGradient colors={colors} style={styles.kpiCard} start={{x:0, y:0}} end={{x:1, y:1}}>
                <View style={styles.kpiHeader}>
                    <Text style={styles.kpiLabel} numberOfLines={1}>{label}</Text>
                    <Ionicons name={icon} size={16} color="rgba(255,255,255,0.8)" />
                </View>
                <Text style={styles.kpiValue}>{value}</Text>
            </LinearGradient>
        </Animated.View>
    );

    const renderItem = ({ item, index }: { item: any, index: number }) => {
        const config = getStatusConfig(item.job_status);
        
        return (
            <Animated.View entering={FadeInDown.delay(index * 50).duration(500)}>
                <View style={[styles.card, { borderLeftColor: config.color }]}>
                    <View style={styles.cardHeader}>
                        <View style={{flexDirection:'row', alignItems:'center', flex:1}}>
                            <View style={styles.avatar}>
                                <Text style={{fontSize:16}}>📝</Text>
                            </View>
                            <View style={{marginLeft: 10, flex:1}}>
                                <Text style={styles.reporterName} numberOfLines={1}>{item.project_name || '(ไม่ระบุโครงการ)'}</Text>
                                <Text style={styles.dateText}>{formatDateForDisplay(new Date(item.report_date))}</Text>
                            </View>
                        </View>
                        <View style={[styles.statusBadge, { backgroundColor: config.bg }]}>
                            <Text style={{ color: config.color, fontWeight: 'bold', fontSize: 10 }}>{item.job_status}</Text>
                        </View>
                    </View>

                    <View style={styles.cardBody}>
                        <View style={styles.infoRow}>
                            <Ionicons name="business-outline" size={14} color="#666" style={{marginRight:6}}/>
                            <Text style={styles.clientText} numberOfLines={1}>{item.work_result}</Text>
                        </View>
                        <View style={styles.infoRow}>
                            <Ionicons name="location-outline" size={14} color="#666" style={{marginRight:6}}/>
                            <Text style={styles.infoText} numberOfLines={1}>
                                {item.work_type === 'company' ? 'เข้าออฟฟิศ' : item.province || 'นอกสถานที่'}
                            </Text>
                        </View>
                    </View>

                    <View style={styles.cardFooter}>
                        <TouchableOpacity onPress={() => openDetailModal(item)} style={styles.btnDetail}>
                            <Text style={{ color: PRIMARY_COLOR, fontWeight: 'bold', fontSize: 13 }}>รายละเอียด</Text>
                            <Ionicons name="chevron-forward" size={14} color={PRIMARY_COLOR} />
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
                <Text style={styles.headerTitle}>📜 ประวัติของฉัน</Text>
                <Text style={styles.headerSub}>{user?.fullname || 'พนักงาน'}</Text>
            </View>

            {/* Filter Section */}
            <View style={styles.filterSection}>
                
                {/* Status Filter (Chips) */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterChipContainer}>
                    {FILTER_OPTIONS.map((status, index) => (
                        <TouchableOpacity 
                            key={index}
                            onPress={() => setFilterStatus(status)}
                            style={[
                                styles.filterChip,
                                filterStatus === status && styles.activeFilterChip
                            ]}
                        >
                            <Text style={[
                                styles.filterChipText,
                                filterStatus === status && styles.activeFilterChipText
                            ]}>
                                {status}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>

                {/* Date Filter */}
                <View style={styles.dateFilterRow}>
                    <TouchableOpacity onPress={() => openDatePicker('start')} style={styles.dateBtn}>
                        <Text style={styles.dateBtnText}>{startDate ? formatDateForDisplay(startDate) : 'วันที่เริ่ม'}</Text>
                        <Ionicons name="calendar-outline" size={16} color="#666" />
                    </TouchableOpacity>
                    
                    <Ionicons name="arrow-forward" size={14} color="#ccc" style={{marginHorizontal:5}}/>
                    
                    <TouchableOpacity onPress={() => openDatePicker('end')} style={styles.dateBtn}>
                        <Text style={styles.dateBtnText}>{endDate ? formatDateForDisplay(endDate) : 'ถึงวันที่'}</Text>
                        <Ionicons name="calendar-outline" size={16} color="#666" />
                    </TouchableOpacity>
                </View>
                
                {/* Action Buttons */}
                <View style={styles.actionButtonRow}>
                    <TouchableOpacity onPress={handleSearch} style={styles.searchBtn}>
                        <Ionicons name="search" size={18} color="white" />
                        <Text style={styles.btnTextWhite}>ค้นหา</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={handleReset} style={styles.resetBtn}>
                        <Ionicons name="refresh" size={18} color="white" />
                        <Text style={styles.btnTextWhite}>รีเซ็ต</Text>
                    </TouchableOpacity>
                </View>
            </View>

            {loading ? <ActivityIndicator size="large" color={PRIMARY_COLOR} style={{marginTop: 50}} /> : 
            <FlatList
                data={displayedList} // ✅ ใช้ displayedList ที่กรองแล้ว
                keyExtractor={(item) => item.id.toString()}
                renderItem={renderItem}
                contentContainerStyle={{ paddingBottom: 20, paddingTop: 10 }}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchHistory(); }} />}
                ListHeaderComponent={
                    <View style={styles.kpiContainer}>
                        <View style={styles.kpiRow}>
                            <KpiCard label="รวมรายการ" value={summary.total} icon="documents" colors={['#4e54c8', '#8f94fb']} delay={0} />
                            <KpiCard label="ยอดเบิกจ่าย" value={summary.expense ? (summary.expense / 1000).toFixed(1) + 'k' : '0'} icon="wallet" colors={['#9b59b6', '#8e44ad']} delay={100} />
                        </View>
                        
                        {/* Breakdown */}
                        {statusBreakdown.length > 0 && (
                            <View style={styles.dynamicGrid}>
                                {statusBreakdown.map((item, index) => {
                                    const config = getStatusConfig(item.status);
                                    return (
                                        <View key={index} style={styles.gridItem}>
                                            <KpiCard 
                                                label={item.status} 
                                                value={item.count} 
                                                icon={config.icon} 
                                                colors={config.colors} 
                                                delay={200 + (index * 50)} 
                                            />
                                        </View>
                                    );
                                })}
                            </View>
                        )}
                        
                        <Text style={styles.sectionTitle}>
                            รายการล่าสุด ({displayedList.length})
                            {filterStatus !== 'ทั้งหมด' ? ` [${filterStatus}]` : ''}
                        </Text>
                    </View>
                }
                ListEmptyComponent={<View style={styles.emptyState}><Ionicons name="file-tray-outline" size={50} color="#ccc"/><Text style={{color:'#999', marginTop:10}}>ไม่พบข้อมูลประวัติ</Text></View>}
            />}

            {/* Date Picker Modal */}
            {showDatePicker && (Platform.OS === 'ios' ? (
                <Modal transparent={true} animationType="fade"><View style={styles.modalOverlay}><View style={[styles.modalContent, {width: '85%', alignItems:'center'}]}><DateTimePicker value={tempDate} mode="date" display="inline" locale="th-TH" onChange={(e, d) => d && setTempDate(d)} /><TouchableOpacity onPress={confirmDateIOS} style={styles.iosPickerBtn}><Text style={{color: PRIMARY_COLOR, fontWeight:'bold'}}>ตกลง</Text></TouchableOpacity></View></View></Modal>
            ) : (<DateTimePicker value={dateField === 'start' ? (startDate || new Date()) : (endDate || new Date())} mode="date" display="default" onChange={onDateChange} />))}

            {/* Detail Modal */}
            <Modal visible={modalVisible} transparent={true} animationType="slide" onRequestClose={() => setModalVisible(false)}>
                <View style={styles.detailModalOverlay}>
                    <View style={styles.detailModalContent}>
                        <View style={styles.detailHeader}>
                            <Text style={styles.detailTitle}>รายละเอียดงาน</Text>
                            <TouchableOpacity onPress={() => setModalVisible(false)}><Ionicons name="close" size={24} color="#999"/></TouchableOpacity>
                        </View>
                        <ScrollView style={{maxHeight: 500}}>
                            {selectedItem && (
                                <View style={{paddingBottom:20}}>
                                    <DetailItem icon="clipboard" color="#333" title="โครงการ" text={selectedItem.project_name} />
                                    <DetailItem icon="business" color="#333" title="ลูกค้า/หน่วยงาน" text={selectedItem.work_result} />
                                    <View style={styles.divider} />
                                    
                                    <DetailItem icon="alert-circle" color="#e74c3c" title="ปัญหาที่พบ" text={selectedItem.problem} />
                                    <DetailItem icon="bulb" color="#f39c12" title="ข้อเสนอแนะ" text={selectedItem.suggestion} />
                                    <DetailItem icon="document-text" color={PRIMARY_COLOR} title="หมายเหตุ" text={selectedItem.additional_notes} />
                                    
                                    <Text style={styles.imgHeader}>📸 หลักฐานการเบิกจ่าย</Text>
                                    <View style={{flexDirection:'row', gap:15, marginTop:10}}>
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

const DetailItem = ({icon, color, title, text}: any) => (
    <View style={{marginBottom: 12}}>
        <View style={{flexDirection:'row', alignItems:'center', marginBottom:4}}>
            <Ionicons name={icon} size={16} color={color} style={{marginRight:6}} />
            <Text style={{fontWeight:'bold', color:'#555', fontSize:13}}>{title}</Text>
        </View>
        <Text style={{color:'#333', paddingLeft:24, lineHeight:20, fontSize:14}}>{text || '-'}</Text>
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
    headerSub: { fontSize: 14, color: '#666', marginTop: 2 },

    filterSection: { padding: 15, backgroundColor: 'white', borderBottomLeftRadius: 20, borderBottomRightRadius: 20, shadowColor:'#000', shadowOpacity:0.05, shadowRadius:10, elevation:3, zIndex:10 },
    
    filterChipContainer: { flexDirection: 'row', marginBottom: 15 },
    filterChip: { paddingHorizontal: 15, paddingVertical: 8, borderRadius: 20, backgroundColor: '#f0f2f5', marginRight: 8, borderWidth: 1, borderColor: '#eee' },
    activeFilterChip: { backgroundColor: PRIMARY_COLOR, borderColor: PRIMARY_COLOR },
    filterChipText: { fontSize: 13, color: '#636e72' },
    activeFilterChipText: { color: 'white', fontWeight: 'bold' },

    dateFilterRow: { flexDirection: 'row', alignItems: 'center', justifyContent:'space-between', marginBottom: 15 },
    dateBtn: { flex: 1, flexDirection:'row', justifyContent:'space-between', alignItems:'center', backgroundColor: '#f0f2f5', padding: 12, borderRadius: 10 },
    dateBtnText: { fontSize: 13, color: '#555', fontWeight:'500' },
    
    actionButtonRow: { flexDirection: 'row', gap: 10 },
    searchBtn: { flex:2, flexDirection:'row', backgroundColor: PRIMARY_COLOR, padding: 12, borderRadius: 10, justifyContent: 'center', alignItems: 'center', gap: 5 },
    resetBtn: { flex:1, flexDirection:'row', backgroundColor: COLOR_RESET, padding: 12, borderRadius: 10, justifyContent: 'center', alignItems: 'center', gap: 5 },
    btnTextWhite: { color:'white', fontWeight:'bold' },

    kpiContainer: { paddingHorizontal: 15, marginTop: 15 },
    kpiRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
    dynamicGrid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -5 },
    gridItem: { width: '50%', padding: 5, marginBottom: 5 },
    
    kpiWrapper: { flex: 1 },
    kpiCard: { padding: 12, borderRadius: 15, height: 75, justifyContent: 'space-between', elevation: 2 },
    kpiHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    kpiLabel: { color: 'white', fontSize: 11, fontWeight: 'bold', opacity: 0.9 },
    kpiValue: { color: 'white', fontSize: 20, fontWeight: 'bold' },

    sectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#444', marginTop: 15, marginBottom: 10 },

    card: { backgroundColor: 'white', marginHorizontal: 15, marginBottom: 12, borderRadius: 15, padding: 15, borderLeftWidth: 4, elevation: 2, shadowColor:'#000', shadowOpacity:0.05, shadowRadius:5 },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
    avatar: { width: 35, height: 35, borderRadius: 18, backgroundColor: '#f0f2f5', justifyContent: 'center', alignItems: 'center' },
    reporterName: { fontSize: 14, fontWeight: 'bold', color: '#333' },
    dateText: { fontSize: 11, color: '#888' },
    statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
    
    cardBody: { paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#f0f0f0', marginBottom: 10 },
    infoRow: { flexDirection: 'row', alignItems: 'center', marginTop: 3 },
    clientText: { fontSize: 13, color: '#555', flex: 1 },
    infoText: { fontSize: 12, color: '#888', flex: 1 },

    cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    btnDetail: { flexDirection: 'row', alignItems: 'center' },
    priceTag: { backgroundColor: '#fff5f5', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, borderWidth: 1, borderColor: '#ffccd0' },

    emptyState: { alignItems: 'center', marginTop: 50 },
    divider: { height:1, backgroundColor:'#eee', marginVertical:10 },

    modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)' },
    modalContent: { backgroundColor: 'white', padding: 20, borderRadius: 15, width: '85%', maxHeight: '70%' },
    iosPickerBtn: { flex: 1, padding: 15, alignItems: 'center', backgroundColor: 'white' },
    detailModalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
    detailModalContent: { backgroundColor: 'white', borderTopLeftRadius: 25, borderTopRightRadius: 25, padding: 25, maxHeight: '85%' },
    detailHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    detailTitle: { fontSize: 20, fontWeight: 'bold', color: '#333' },
    imgHeader: { fontSize: 15, fontWeight: 'bold', color: '#333', marginTop: 10 },
});