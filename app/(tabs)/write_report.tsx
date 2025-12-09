import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons'; // ✅ เพิ่มไอคอน
import DateTimePicker from '@react-native-community/datetimepicker';
import axios from 'axios';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient'; // ✅ เพิ่ม Gradient
import * as Location from 'expo-location';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Image,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import Animated, { FadeInDown, Layout } from 'react-native-reanimated'; // ✅ เพิ่ม Animation
import { SafeAreaView } from 'react-native-safe-area-context';

import { API_BASE } from '../../constants/config';
import { useAuth } from '../_layout';

const REGIONS = ['อุบล', 'ภาคอีสาน', 'ภาคเหนือ', 'ภาคกลาง', 'ภาคใต้', 'ภาคตะวันออก', 'ภาคตะวันตก'];
const PRIMARY_COLOR = '#4e54c8';
const SECONDARY_COLOR = '#8f94fb';

export default function WriteReportScreen() {
    const auth = useAuth();
    const user = auth?.user;
    const [loading, setLoading] = useState(false);

    // Data Lists
    const [provinceList, setProvinceList] = useState<string[]>([]);
    const [activityList, setActivityList] = useState<string[]>([]);
    const [statusList, setStatusList] = useState<string[]>([]);

    // Form Data
    const [formData, setFormData] = useState({
        report_date: new Date(),
        work_type: 'company',
        area_zone: '', province: '', gps: '', gps_address: '',
        project_name: '', work_result: '', customer_type: 'ลูกค้าเก่า',
        additional_notes: '', activity_type: '', activity_detail: '',
        job_status: '', next_appointment: null as Date | null,
        problem: '', suggestion: ''
    });

    const [expenses, setExpenses] = useState({
        fuel: { enabled: false, cost: '', image: null as string | null },
        hotel: { enabled: false, cost: '', image: null as string | null },
        other: { enabled: false, cost: '', detail: '', image: null as string | null },
    });

    // DatePicker State
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [dateMode, setDateMode] = useState<'report' | 'next'>('report');
    const [tempDate, setTempDate] = useState(new Date());

    // Modal Selector State
    const [selectorVisible, setSelectorVisible] = useState(false);
    const [selectorTitle, setSelectorTitle] = useState('');
    const [selectorData, setSelectorData] = useState<string[]>([]);
    const [activeField, setActiveField] = useState<'region' | 'province' | 'activity' | 'status' | null>(null);

    const resetForm = () => {
        setFormData({
            report_date: new Date(), work_type: 'company', area_zone: '', province: '', gps: '', gps_address: '',
            project_name: '', work_result: '', customer_type: 'ลูกค้าเก่า', additional_notes: '', 
            activity_type: '', activity_detail: '', job_status: '', next_appointment: null, problem: '', suggestion: ''
        });
        setExpenses({
            fuel: { enabled: false, cost: '', image: null },
            hotel: { enabled: false, cost: '', image: null },
            other: { enabled: false, cost: '', detail: '', image: null },
        });
    };

    useEffect(() => {
        const loadData = async () => {
            try {
                const actRes = await axios.get(`${API_BASE}/api_data.php?action=get_activities`);
                if(Array.isArray(actRes.data)) setActivityList(actRes.data);
                const statRes = await axios.get(`${API_BASE}/api_data.php?action=get_job_status`);
                if(Array.isArray(statRes.data)) setStatusList(statRes.data);
            } catch (e) {
                setActivityList(['เข้าพบลูกค้า', 'โทรติดตามงาน', 'เสนอราคา', 'อื่นๆ']);
                setStatusList(['ได้งาน', 'กำลังติดตาม', 'ไม่ได้งาน']);
            }
        };
        loadData();
    }, []);

    const fetchProvinces = async (region: string) => {
        setFormData(prev => ({ ...prev, area_zone: region, province: '' })); 
        if (!region) return;
        try {
            const res = await axios.get(`${API_BASE}/api_data.php?action=get_provinces&region=${region}`);
            setProvinceList(res.data);
        } catch (e) { console.error(e); }
    };

    const openSelector = (field: 'region' | 'province' | 'activity' | 'status') => {
        if (field === 'province' && !formData.area_zone) {
            return Alert.alert('แจ้งเตือน', 'กรุณาเลือกภาค/โซน ก่อนนะครับ');
        }
        setActiveField(field);
        setSelectorVisible(true);
        switch(field) {
            case 'region': setSelectorTitle('เลือกภาค/โซน'); setSelectorData(REGIONS); break;
            case 'province': setSelectorTitle('เลือกจังหวัด'); setSelectorData(provinceList); break;
            case 'activity': setSelectorTitle('เลือกกิจกรรม'); setSelectorData(activityList); break;
            case 'status': setSelectorTitle('เลือกสถานะงาน'); setSelectorData(statusList); break;
        }
    };

    const onSelectOption = (value: string) => {
        setSelectorVisible(false);
        switch(activeField) {
            case 'region': 
                if (value === 'อุบล') {
                    setFormData(prev => ({ ...prev, area_zone: value, province: 'อุบลราชธานี' }));
                } else {
                    fetchProvinces(value);
                }
                break;
            case 'province': setFormData(prev => ({...prev, province: value})); break;
            case 'activity': setFormData(prev => ({...prev, activity_type: value})); break;
            case 'status': setFormData(prev => ({...prev, job_status: value})); break;
        }
    };

    const handleGetLocation = async () => {
        let { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') { Alert.alert('Error', 'ไม่อนุญาตให้เข้าถึงตำแหน่ง'); return; }
        setFormData(prev => ({ ...prev, gps: 'กำลังค้นหา...', gps_address: 'กำลังโหลด...' }));
        try {
            let location = await Location.getCurrentPositionAsync({});
            let addressText = "ระบุที่อยู่เอง";
            try {
                let addr = await Location.reverseGeocodeAsync({ latitude: location.coords.latitude, longitude: location.coords.longitude });
                if (addr.length > 0) addressText = [addr[0].street, addr[0].subregion, addr[0].region].filter(Boolean).join(' ');
            } catch (e) {}
            setFormData(prev => ({ ...prev, gps: `${location.coords.latitude.toFixed(6)}, ${location.coords.longitude.toFixed(6)}`, gps_address: addressText }));
        } catch (e) { Alert.alert('Error', 'จับ GPS ไม่ได้'); setFormData(prev => ({ ...prev, gps: '', gps_address: '' })); }
    };

    const pickImage = async (type: 'fuel' | 'hotel' | 'other') => {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') return;
        let result = await ImagePicker.launchCameraAsync({ quality: 0.5, allowsEditing: true });
        if (!result.canceled) {
            setExpenses(prev => ({ ...prev, [type]: { ...prev[type], image: result.assets[0].uri } }));
        }
    };

    const handleSubmit = async () => {
        if (!formData.work_result) return Alert.alert('แจ้งเตือน', 'ระบุชื่อลูกค้า/หน่วยงาน');
        setLoading(true);
        const postData = new FormData();
        postData.append('reporter_name', user?.fullname || 'Unknown');
        postData.append('report_date', formData.report_date.toISOString().split('T')[0]);
        postData.append('work_type', formData.work_type);
        if(formData.work_type === 'company') {
            postData.append('area_zone', 'เข้าบริษัท'); postData.append('province', 'กทม');
            postData.append('gps', 'Office'); postData.append('gps_address', 'Office');
            postData.append('activity_type', formData.activity_type);
            postData.append('activity_detail', formData.activity_detail);
        } else {
            postData.append('area_zone', formData.area_zone); postData.append('province', formData.province);
            postData.append('gps', formData.gps); postData.append('gps_address', formData.gps_address);
            postData.append('activity_type', '');
            postData.append('activity_detail', '');
        }
        postData.append('project_name', formData.project_name);
        postData.append('work_result', formData.work_result);
        postData.append('customer_type', formData.customer_type);
        postData.append('additional_notes', formData.additional_notes);
        postData.append('job_status', formData.job_status);
        if(formData.next_appointment) postData.append('next_appointment', formData.next_appointment.toISOString().split('T')[0]);

        postData.append('fuel_cost', expenses.fuel.enabled ? expenses.fuel.cost : '0');
        if (expenses.fuel.enabled && expenses.fuel.image) postData.append('fuel_image', { uri: expenses.fuel.image, name: 'fuel.jpg', type: 'image/jpeg' } as any);
        postData.append('accommodation_cost', expenses.hotel.enabled ? expenses.hotel.cost : '0');
        if (expenses.hotel.enabled && expenses.hotel.image) postData.append('acc_image', { uri: expenses.hotel.image, name: 'acc.jpg', type: 'image/jpeg' } as any);
        postData.append('other_cost', expenses.other.enabled ? expenses.other.cost : '0');
        postData.append('other_cost_detail', expenses.other.enabled ? expenses.other.detail : '');
        if (expenses.other.enabled && expenses.other.image) postData.append('other_image', { uri: expenses.other.image, name: 'other.jpg', type: 'image/jpeg' } as any);
        postData.append('problem', formData.problem);
        postData.append('suggestion', formData.suggestion);

        try {
            const res = await axios.post(`${API_BASE}/api_mobile.php?action=submit_report`, postData, { headers: { 'Content-Type': 'multipart/form-data' }});
            if(res.data.status === 'success') {
                Alert.alert('สำเร็จ', 'บันทึกเรียบร้อย', [{ text: 'OK', onPress: ()=> { resetForm(); router.push('/(tabs)/dashboard'); } }]);
            } else { Alert.alert('บันทึกไม่สำเร็จ', res.data.message); }
        } catch (error: any) { Alert.alert('Connection Error', error.message); } 
        finally { setLoading(false); }
    };

    const openDatePicker = (mode: 'report' | 'next') => {
        setDateMode(mode);
        setTempDate(mode === 'report' ? formData.report_date : (formData.next_appointment || new Date()));
        setShowDatePicker(true);
    };
    const confirmDateIOS = () => {
        setShowDatePicker(false);
        if (dateMode === 'report') setFormData({ ...formData, report_date: tempDate });
        else setFormData({ ...formData, next_appointment: tempDate });
    };
    const onDateChangeAndroid = (event: any, selectedDate?: Date) => {
        setShowDatePicker(false);
        if (selectedDate) {
            if (dateMode === 'report') setFormData({ ...formData, report_date: selectedDate });
            else setFormData({ ...formData, next_appointment: selectedDate });
        }
    };

    // Helper Component for Section Headers
    const SectionHeader = ({ icon, title, color }: any) => (
        <View style={styles.sectionHeader}>
            <Ionicons name={icon} size={20} color={color || PRIMARY_COLOR} style={{ marginRight: 8 }} />
            <Text style={[styles.label, { marginTop: 0, color: color || '#333' }]}>{title}</Text>
        </View>
    );

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: '#f8f9fd' }} edges={['top']}>
            <ScrollView contentContainerStyle={styles.container}>
                
                {/* Header Title */}
                <Animated.View entering={FadeInDown.delay(100).duration(500)}>
                    <Text style={styles.mainHeader}>📝 เขียนรายงานประจำวัน</Text>
                </Animated.View>

                <Animated.View style={styles.card} entering={FadeInDown.delay(200).duration(500)}>
                    
                    {/* Date & Reporter Info */}
                    <View style={styles.row}>
                        <TouchableOpacity onPress={()=> openDatePicker('report')} style={[styles.inputContainer, styles.dateInput]}>
                            <Ionicons name="calendar-outline" size={20} color={PRIMARY_COLOR} style={{marginRight: 8}} />
                            <Text style={styles.inputText}>{formData.report_date.toLocaleDateString('th-TH')}</Text>
                        </TouchableOpacity>
                        <View style={[styles.inputContainer, styles.readOnlyInput, {flex: 1, marginLeft: 10}]}>
                            <Ionicons name="person-outline" size={20} color="#666" style={{marginRight: 8}} />
                            <Text style={[styles.inputText, {color:'#666'}]}>{user?.fullname}</Text>
                        </View>
                    </View>

                    {/* Work Location Section */}
                    <SectionHeader icon="location-outline" title="สถานที่ทำงาน" />
                    <View style={styles.radioGroup}>
                        <Pressable onPress={()=>setFormData({...formData, work_type:'company'})} style={[styles.radioBtn, formData.work_type==='company' && styles.radioBtnActive]}>
                            <MaterialCommunityIcons name="office-building" size={24} color={formData.work_type==='company'?'white':PRIMARY_COLOR} />
                            <Text style={[styles.radioText, formData.work_type==='company' && styles.radioTextActive]}>เข้าบริษัท</Text>
                        </Pressable>
                        <Pressable onPress={()=>setFormData({...formData, work_type:'outside'})} style={[styles.radioBtn, formData.work_type==='outside' && styles.radioBtnActive]}>
                            <MaterialCommunityIcons name="car-side" size={24} color={formData.work_type==='outside'?'white':PRIMARY_COLOR} />
                            <Text style={[styles.radioText, formData.work_type==='outside' && styles.radioTextActive]}>นอกสถานที่</Text>
                        </Pressable>
                    </View>

                    {/* Animated Outside Work Fields */}
                    {formData.work_type === 'outside' && (
                        <Animated.View layout={Layout.springify()} style={styles.subBox}>
                            <Text style={styles.subLabel}>ภาค/โซน:</Text>
                            <TouchableOpacity onPress={() => openSelector('region')} style={styles.selectorBtn}>
                                <Text style={formData.area_zone ? styles.selectorText : styles.placeholderText}>{formData.area_zone || 'เลือกภาค/โซน'}</Text>
                                <Ionicons name="chevron-down" size={20} color="#aaa" />
                            </TouchableOpacity>

                            {formData.area_zone !== 'อุบล' && (
                                <Animated.View layout={Layout.springify()}>
                                    <Text style={styles.subLabel}>จังหวัด:</Text>
                                    <TouchableOpacity onPress={() => openSelector('province')} style={styles.selectorBtn}>
                                        <Text style={formData.province ? styles.selectorText : styles.placeholderText}>{formData.province || 'เลือกจังหวัด'}</Text>
                                        <Ionicons name="chevron-down" size={20} color="#aaa" />
                                    </TouchableOpacity>
                                </Animated.View>
                            )}

                            <TouchableOpacity style={styles.gpsBtn} onPress={handleGetLocation}>
                                <LinearGradient colors={['#00b894', '#00cec9']} style={styles.gradientBtn} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                                    <Ionicons name="navigate-outline" size={20} color="white" style={{marginRight:5}} />
                                    <Text style={{color:'white', fontWeight:'bold'}}>จับพิกัด GPS</Text>
                                </LinearGradient>
                            </TouchableOpacity>
                            <TextInput style={[styles.input, {backgroundColor:'#fff'}]} value={formData.gps_address} onChangeText={(t)=>setFormData({...formData, gps_address:t})} placeholder="ที่อยู่ (หรือระบุเอง)..." multiline />
                        </Animated.View>
                    )}

                    {/* Work Details Section */}
                    <SectionHeader icon="briefcase-outline" title="รายละเอียดงาน" />
                    <View style={styles.inputWithIcon}>
                        <Ionicons name="folder-open-outline" size={20} color="#aaa" style={styles.inputIcon} />
                        <TextInput style={styles.headlessInput} placeholder="ชื่อโครงการ..." value={formData.project_name} onChangeText={(t)=>setFormData({...formData, project_name:t})} />
                    </View>
                    <View style={styles.inputWithIcon}>
                        <Ionicons name="people-outline" size={20} color="#aaa" style={styles.inputIcon} />
                        <TextInput style={styles.headlessInput} placeholder="ลูกค้า / หน่วยงาน..." value={formData.work_result} onChangeText={(t)=>setFormData({...formData, work_result:t})} />
                    </View>
                    
                    {formData.work_type === 'company' && (
                        <Animated.View layout={Layout.springify()}>
                             <SectionHeader icon="list-outline" title="กิจกรรมที่ทำ" />
                            <TouchableOpacity onPress={() => openSelector('activity')} style={styles.selectorBtn}>
                                <Text style={formData.activity_type ? styles.selectorText : styles.placeholderText}>{formData.activity_type || 'เลือกกิจกรรม'}</Text>
                                <Ionicons name="chevron-down" size={20} color="#aaa" />
                            </TouchableOpacity>
                            {formData.activity_type === 'อื่นๆ' && (
                                <TextInput style={[styles.input, {marginTop: 10}]} placeholder="ระบุรายละเอียดกิจกรรม..." value={formData.activity_detail} onChangeText={(t)=>setFormData({...formData, activity_detail:t})} />
                            )}
                        </Animated.View>
                    )}
                    
                     <SectionHeader icon="flag-outline" title="สถานะงาน" />
                    <TouchableOpacity onPress={() => openSelector('status')} style={styles.selectorBtn}>
                        <Text style={formData.job_status ? styles.selectorText : styles.placeholderText}>{formData.job_status || 'เลือกสถานะงาน'}</Text>
                        <Ionicons name="chevron-down" size={20} color="#aaa" />
                    </TouchableOpacity>

                     <SectionHeader icon="document-text-outline" title="บันทึกเพิ่มเติม (สรุปงาน)" />
                    <TextInput style={[styles.input, styles.textArea]} multiline placeholder="สรุปรายละเอียด..." value={formData.additional_notes} onChangeText={(t)=>setFormData({...formData, additional_notes: t})} />

                     <SectionHeader icon="calendar-number-outline" title="นัดหมายถัดไป" />
                    <View style={styles.selectorBtn}>
                        <TouchableOpacity onPress={() => openDatePicker('next')} style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
                            <Ionicons name="calendar" size={20} color={formData.next_appointment ? PRIMARY_COLOR : '#aaa'} style={{marginRight: 8}}/>
                            <Text style={formData.next_appointment ? styles.selectorText : styles.placeholderText}>{formData.next_appointment ? formData.next_appointment.toLocaleDateString('th-TH') : 'เลือกวันที่นัดหมาย...'}</Text>
                        </TouchableOpacity>
                        {formData.next_appointment && (
                            <TouchableOpacity onPress={() => setFormData({ ...formData, next_appointment: null })} style={styles.clearDateBtn}>
                                <Ionicons name="close-circle" size={20} color="#e74c3c" />
                            </TouchableOpacity>
                        )}
                    </View>

                    {/* Expenses Section */}
                    <View style={[styles.divider, {marginTop: 25, marginBottom: 15}]} />
                    <SectionHeader icon="wallet-outline" title="ค่าใช้จ่าย (ถ้ามี)" color="#e17055" />
                    
                    <ExpenseItem title="⛽ ค่าน้ำมัน" icon="gas-station" data={expenses.fuel} onToggle={(v: boolean)=>setExpenses({...expenses, fuel:{...expenses.fuel, enabled:v}})} onChange={(t: string)=>setExpenses({...expenses, fuel:{...expenses.fuel, cost:t}})} onPick={()=>pickImage('fuel')} />
                    <ExpenseItem title="🏨 ค่าที่พัก" icon="bed" data={expenses.hotel} onToggle={(v: boolean)=>setExpenses({...expenses, hotel:{...expenses.hotel, enabled:v}})} onChange={(t: string)=>setExpenses({...expenses, hotel:{...expenses.hotel, cost:t}})} onPick={()=>pickImage('hotel')} />
                    <ExpenseItem title="🧩 อื่นๆ" icon="dots-horizontal-circle" data={expenses.other} onToggle={(v: boolean)=>setExpenses({...expenses, other:{...expenses.other, enabled:v}})} onChange={(t: string)=>setExpenses({...expenses, other:{...expenses.other, cost:t}})} onPick={()=>pickImage('other')} />
                    {expenses.other.enabled && (
                        <Animated.View layout={Layout.springify()}>
                            <TextInput style={[styles.input, {marginTop: 0}]} placeholder="ระบุรายละเอียดอื่นๆ..." value={expenses.other.detail} onChangeText={(t)=>setExpenses({...expenses, other:{...expenses.other, detail:t}})} />
                        </Animated.View>
                    )}

                    <View style={[styles.divider, {marginTop: 25, marginBottom: 15}]} />
                    <SectionHeader icon="alert-circle-outline" title="ปัญหา / ข้อเสนอแนะ" />
                    <TextInput style={[styles.input, styles.textAreaSmall]} multiline placeholder="ปัญหาที่พบ..." value={formData.problem} onChangeText={(t)=>setFormData({...formData, problem: t})} />
                    <TextInput style={[styles.input, styles.textAreaSmall]} multiline placeholder="ข้อเสนอแนะ..." value={formData.suggestion} onChangeText={(t)=>setFormData({...formData, suggestion: t})} />

                    {/* Submit Button */}
                    <TouchableOpacity onPress={handleSubmit} disabled={loading} activeOpacity={0.8}>
                        <LinearGradient colors={[PRIMARY_COLOR, SECONDARY_COLOR]} style={styles.submitBtn} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                            {loading ? <ActivityIndicator color="white"/> : (
                                <>
                                    <Ionicons name="paper-plane" size={24} color="white" style={{marginRight: 10}} />
                                    <Text style={styles.submitBtnText}>ส่งรายงาน</Text>
                                </>
                            )}
                        </LinearGradient>
                    </TouchableOpacity>
                </Animated.View>
                
                <View style={{height:50}}/>
                
                {/* Modals */}
                {showDatePicker && Platform.OS === 'ios' ? (<Modal transparent={true} animationType="fade"><View style={styles.modalOverlay}><View style={styles.modalContent}><DateTimePicker value={tempDate} mode="date" display="inline" onChange={(e, d) => d && setTempDate(d)} /><TouchableOpacity onPress={confirmDateIOS} style={styles.closeBtn}><Text style={{color:'white', fontWeight:'bold'}}>ตกลง</Text></TouchableOpacity></View></View></Modal>) : (showDatePicker && <DateTimePicker value={dateMode === 'report' ? formData.report_date : (formData.next_appointment || new Date())} mode="date" display="default" onChange={onDateChangeAndroid} />)}

                <Modal visible={selectorVisible} transparent={true} animationType="fade" onRequestClose={() => setSelectorVisible(false)}>
                    <View style={styles.modalOverlay}>
                        <Animated.View entering={FadeInDown.duration(300)} style={styles.modalContent}>
                            <View style={styles.modalHeaderBar}>
                                <Text style={styles.modalHeaderTitle}>{selectorTitle}</Text>
                                <TouchableOpacity onPress={() => setSelectorVisible(false)}>
                                    <Ionicons name="close" size={24} color="#999" />
                                </TouchableOpacity>
                            </View>
                            <FlatList
                                data={selectorData}
                                keyExtractor={(item, index) => index.toString()}
                                style={{maxHeight: 350, width: '100%'}}
                                renderItem={({ item }) => (
                                    <TouchableOpacity onPress={() => onSelectOption(item)} style={styles.modalItem}>
                                        <Text style={styles.modalItemText}>{item}</Text>
                                        <Ionicons name="chevron-forward" size={20} color="#eee" />
                                    </TouchableOpacity>
                                )}
                                ListEmptyComponent={<Text style={{textAlign:'center', padding:20, color:'#999'}}>ไม่มีข้อมูล</Text>}
                            />
                        </Animated.View>
                    </View>
                </Modal>

            </ScrollView>
        </SafeAreaView>
    );
}

// Animated Expense Item Component
const ExpenseItem = ({title, icon, data, onToggle, onChange, onPick}: any) => (
    <Animated.View layout={Layout.springify()} style={styles.expenseItem}>
        <View style={styles.expenseHeader}>
            <View style={{flexDirection:'row', alignItems:'center'}}>
                <MaterialCommunityIcons name={icon} size={24} color="#666" style={{marginRight: 10}} />
                <Text style={styles.expenseTitle}>{title}</Text>
            </View>
            <Switch value={data.enabled} onValueChange={onToggle} trackColor={{ false: "#eee", true: SECONDARY_COLOR }} thumbColor={data.enabled ? PRIMARY_COLOR : "#f4f3f4"} />
        </View>
        {data.enabled && (
            <Animated.View entering={FadeInDown} layout={Layout.springify()} style={{marginTop: 10}}>
                <View style={styles.inputWithIcon}>
                    <Text style={{paddingLeft: 15, color:'#888', fontSize: 18}}>฿</Text>
                    <TextInput style={[styles.headlessInput, {fontSize: 18, fontWeight:'bold', color:PRIMARY_COLOR}]} placeholder="0" keyboardType="numeric" value={data.cost} onChangeText={onChange}/>
                </View>
                <TouchableOpacity onPress={onPick} style={styles.photoBtn}>
                    <Ionicons name={data.image ? "checkmark-circle" : "camera"} size={24} color={data.image ? "#27ae60" : "#666"} style={{marginRight: 10}} />
                    <Text style={{color: data.image ? "#27ae60" : "#666", fontWeight:'bold'}}>{data.image ? 'แนบรูปภาพเรียบร้อย' : 'ถ่ายรูปใบเสร็จ'}</Text>
                </TouchableOpacity>
                {data.image && <Image source={{ uri: data.image }} style={styles.receiptImage} />}
            </Animated.View>
        )}
    </Animated.View>
);

const styles = StyleSheet.create({
    container: { padding: 15 },
    mainHeader: { fontSize: 24, fontWeight: 'bold', color: '#2d3436', marginBottom: 20, textAlign: 'center' },
    card: { backgroundColor: 'white', padding: 20, borderRadius: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 5 },
    row: { flexDirection: 'row', marginBottom: 20 },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, marginTop: 5 },
    label: { fontWeight: 'bold', fontSize: 16, color: '#333' },
    subLabel: { fontSize: 14, color: '#666', marginBottom: 8, marginTop: 12 },
    divider: { height: 1, backgroundColor: '#f0f0f0', width: '100%' },

    // Inputs
    inputContainer: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#e0e0e0', backgroundColor: '#fff' },
    dateInput: { borderColor: PRIMARY_COLOR, backgroundColor: '#f4f5ff' },
    readOnlyInput: { backgroundColor: '#f8f9fa', borderWidth: 0 },
    inputText: { fontSize: 16, color: '#333' },
    input: { borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 12, padding: 14, backgroundColor: '#fff', marginBottom: 15, fontSize: 16, color: '#333' },
    inputWithIcon: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 12, backgroundColor: '#fff', marginBottom: 15 },
    inputIcon: { paddingLeft: 15 },
    headlessInput: { flex: 1, padding: 14, fontSize: 16, color: '#333' },
    textArea: { height: 100, textAlignVertical: 'top' },
    textAreaSmall: { height: 70, textAlignVertical: 'top' },

    // Selectors & Buttons
    selectorBtn: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 12, backgroundColor: '#fff', marginBottom: 15 },
    selectorText: { fontSize: 16, color: '#333' },
    placeholderText: { fontSize: 16, color: '#aaa' },
    radioGroup: { flexDirection: 'row', gap: 12, marginBottom: 20 },
    radioBtn: { flex: 1, flexDirection: 'row', padding: 14, borderWidth: 1.5, borderColor: '#e0e0e0', alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#fff' },
    radioBtnActive: { backgroundColor: PRIMARY_COLOR, borderColor: PRIMARY_COLOR },
    radioText: { marginLeft: 8, fontWeight: 'bold', color: '#666', fontSize: 16 },
    radioTextActive: { color: 'white' },
    subBox: { backgroundColor: '#f8f9fd', padding: 15, borderRadius: 15, borderWidth: 1, borderColor: '#eee', marginBottom: 20 },
    gpsBtn: { marginVertical: 10 },
    gradientBtn: { flexDirection: 'row', padding: 12, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    clearDateBtn: { padding: 5 },
    submitBtn: { borderRadius: 15, marginTop: 10, overflow: 'hidden' },
    submitBtnText: { color: 'white', fontWeight: 'bold', fontSize: 18, padding: 16, textAlign: 'center' },

    // Expenses
    expenseItem: { marginBottom: 12, padding: 15, backgroundColor: '#fbfbfc', borderRadius: 15, borderWidth: 1, borderColor: '#f0f0f0' },
    expenseHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    expenseTitle: { fontWeight: 'bold', fontSize: 16, color: '#444' },
    photoBtn: { flexDirection: 'row', padding: 12, backgroundColor: '#f0f2f5', borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
    receiptImage: { width: '100%', height: 150, borderRadius: 10, marginTop: 10 },

    // Modal
    modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
    modalContent: { backgroundColor: 'white', borderTopLeftRadius: 25, borderTopRightRadius: 25, padding: 20, paddingBottom: 30, maxHeight: '70%' },
    modalHeaderBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15, paddingBottom: 15, borderBottomWidth: 1, borderBottomColor: '#eee' },
    modalHeaderTitle: { fontSize: 20, fontWeight: 'bold', color: PRIMARY_COLOR },
    modalItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#f8f8f8' },
    modalItemText: { fontSize: 17, color: '#333' },
    closeBtn: { marginTop: 20, backgroundColor: PRIMARY_COLOR, padding: 14, borderRadius: 12, width: '100%', alignItems: 'center' }
});