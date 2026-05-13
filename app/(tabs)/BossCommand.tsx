import React, { useState, useEffect, useMemo } from 'react';
import { 
  StyleSheet, Text, View, TextInput, ScrollView, TouchableOpacity, 
  Image, ActivityIndicator, SafeAreaView, Platform, KeyboardAvoidingView, Modal, StatusBar, Dimensions, useColorScheme
} from 'react-native';
import * as ImagePicker from 'expo-image-picker'; 
import DateTimePicker from '@react-native-community/datetimepicker';
import { 
    Send, Image as ImageIcon, X, Search, CheckCircle2, 
    FileText, Users, Building2, CalendarClock, AlertCircle, HelpCircle, ChevronRight, Briefcase, Clock
} from 'lucide-react-native';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BlurView } from 'expo-blur';

// ✅ Import Config
import { API_BASE, IMG_BASE_URL } from '../../constants/config'; 

const { width } = Dimensions.get('window');

// --- [THEME CONFIGURATION] ---
const Colors = {
    light: {
        background: '#F1F5F9',
        card: '#FFFFFF',
        text: '#1E293B',
        textSecondary: '#64748B',
        border: '#E2E8F0',
        inputBg: '#F8FAFC',
        modalOverlay: 'rgba(15, 23, 42, 0.6)',
        divider: '#E2E8F0',
        subBlockBg: '#F8FAFC',
        bottomBar: 'rgba(255,255,255,0.9)',
    },
    dark: {
        background: '#0B1120',
        card: '#1E293B',
        text: '#F8FAFC',
        textSecondary: '#94A3B8',
        border: '#334155',
        inputBg: '#0F172A',
        modalOverlay: 'rgba(0, 0, 0, 0.75)',
        divider: '#334155',
        subBlockBg: '#0F172A',
        bottomBar: 'rgba(30, 41, 59, 0.9)',
    }
};

// --- 🎨 Helper Function: บังคับใช้โลโก้และสีตาม ID จริงจากฐานข้อมูล ---
const getCompanyTheme = (companyId: any) => {
    const id = String(companyId);

    const baseConfig: any = {
        '6': { color: '#F59E0B', logo: `${IMG_BASE_URL}/logosdeer/logo_1766477513_380.png`, name: 'TJC CORPORATION' },
        '2': { color: '#10B981', logo: `${IMG_BASE_URL}/logosdeer/logo_1766477549_239.png`, name: 'TANGJAI CORPORATION' },
        '3': { color: '#3B82F6', logo: `${IMG_BASE_URL}/logosdeer/logo_1766477538_294.png`, name: 'ASCENT CORPORATION' },
        '5': { color: '#64748B', logo: `${IMG_BASE_URL}/logosdeer/logo_1766477525_718.png`, name: 'A.R.T EXPONENTIAL' },
    };

    // คืนค่าตาม ID ถ้าหาไม่เจอให้กลับไปที่ ID 6 (TJC)
    return baseConfig[id] || baseConfig['6'];
};

// --- 🎨 Custom Beautiful Alert Component ---
const CustomAlert = ({ visible, type, title, message, onCancel, onConfirm, isDark }: any) => {
    if (!visible) return null;
    const theme = isDark ? Colors.dark : Colors.light;

    let icon = <HelpCircle size={56} color="#6366F1" />;
    let btnColor = "#6366F1";
    let btnText = "ตกลง";
    let bgColor = isDark ? "rgba(99, 102, 241, 0.2)" : "#EEF2FF";

    if (type === 'success') {
        icon = <CheckCircle2 size={56} color="#10B981" />;
        btnColor = "#10B981";
        bgColor = isDark ? "rgba(16, 185, 129, 0.2)" : "#ECFDF5";
    } else if (type === 'warning') {
        icon = <AlertCircle size={56} color="#F59E0B" />;
        btnColor = "#F59E0B";
        bgColor = isDark ? "rgba(245, 158, 11, 0.2)" : "#FFFBEB";
        btnText = "เข้าใจแล้ว";
    } else if (type === 'error') {
        icon = <X size={56} color="#EF4444" />;
        btnColor = "#EF4444";
        bgColor = isDark ? "rgba(239, 68, 68, 0.2)" : "#FEF2F2";
        btnText = "ปิด";
    }

    return (
        <Modal transparent visible={visible} animationType="fade">
            <View style={[alertStyles.overlay, { backgroundColor: theme.modalOverlay }]}>
                <View style={[alertStyles.alertBox, { backgroundColor: theme.card }]}>
                    <View style={[alertStyles.alertIconArea, { backgroundColor: bgColor }]}>{icon}</View>
                    <Text style={[alertStyles.alertTitle, { color: theme.text }]}>{title}</Text>
                    <Text style={[alertStyles.alertMessage, { color: theme.textSecondary }]}>{message}</Text>
                    
                    <View style={alertStyles.alertBtnRow}>
                        {type === 'question' && (
                            <TouchableOpacity style={[alertStyles.alertBtnCancel, { backgroundColor: theme.inputBg }]} onPress={onCancel}>
                                <Text style={[alertStyles.alertBtnCancelText, { color: theme.textSecondary }]}>ยกเลิก</Text>
                            </TouchableOpacity>
                        )}
                        <TouchableOpacity style={[alertStyles.alertBtnConfirm, { backgroundColor: btnColor }]} onPress={onConfirm}>
                            <Text style={alertStyles.alertBtnConfirmText}>{type === 'question' ? 'ยืนยัน' : btnText}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
};

export default function BossCommand() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const theme = isDark ? Colors.dark : Colors.light;
  const styles = useMemo(() => getStyles(isDark), [isDark]);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  
  const [taskId, setTaskId] = useState('');
  const [companies, setCompanies] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  
  const [currentUserName, setCurrentUserName] = useState('Admin (Mobile)');

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedCompanyId, setSelectedCompanyId] = useState<any>(null);
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const [searchText, setSearchText] = useState(''); 
  
  const [date, setDate] = useState(new Date());
  const pad = (n: number) => n < 10 ? '0'+n : n;
  const [timeText, setTimeText] = useState(`${pad(new Date().getHours())}:${pad(new Date().getMinutes())}`);
  
  const [showDatePicker, setShowDatePicker] = useState(false); 
  const [showTimePicker, setShowTimePicker] = useState(false); 

  const [images, setImages] = useState<any[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [activeImage, setActiveImage] = useState<string | null>(null);

  const [alertVisible, setAlertVisible] = useState(false);
  const [alertConfig, setAlertConfig] = useState({ type: 'success', title: '', message: '' });

  useEffect(() => {
    fetchData();
    loadUserData();
  }, []);

  const loadUserData = async () => {
    try {
        let storedUsername = await AsyncStorage.getItem('username'); 
        if (!storedUsername) {
            const userData = await AsyncStorage.getItem('user');
            if (userData) {
                const parsed = JSON.parse(userData);
                storedUsername = parsed.username; 
            }
        }
        if (storedUsername) {
            setCurrentUserName(storedUsername);
        } else {
            setCurrentUserName('admin'); 
        }
    } catch (e) {
        setCurrentUserName('admin');
    }
  };
  
  const fetchData = async () => {
    try {
      const url = `${API_BASE}/api_tasks.php?action=get_boss_data`;
      const res = await axios.get(url);
      
      setTaskId(res.data.task_id);
      setCompanies(res.data.companies);
      setEmployees(res.data.employees);
      
      if (res.data.companies?.length > 0) {
        setSelectedCompanyId(res.data.companies[0].id);
      }
      setLoading(false);
    } catch (error) {
      console.error(error);
      showAlert('error', 'เชื่อมต่อล้มเหลว', 'ไม่สามารถโหลดข้อมูลจาก Server ได้');
      setLoading(false);
    }
  };

  const showAlert = (type: string, title: string, message: string) => {
    setAlertConfig({ type, title, message });
    setAlertVisible(true);
  };

  const closeAlert = () => setAlertVisible(false);

  const filteredEmployees = employees.filter(emp => 
    emp.company_id == selectedCompanyId && 
    emp.label.toLowerCase().includes(searchText.toLowerCase())
  );

  const onChangeDate = (event: any, selectedDate?: Date) => {
    if (event.type === 'dismissed') { setShowDatePicker(false); return; }
    const currentDate = selectedDate || date;
    setShowDatePicker(Platform.OS === 'ios');
    setDate(currentDate);
  };

  const onChangeTime = (event: any, selectedDate?: Date) => {
    if (event.type === 'dismissed') { setShowTimePicker(false); return; }
    const currentDate = selectedDate || date;
    setShowTimePicker(Platform.OS === 'ios');
    setDate(currentDate);
    setTimeText(`${pad(currentDate.getHours())}:${pad(currentDate.getMinutes())}`);
  };

  const isValidTime = (time: string) => /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(time);

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return;
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.8,
    });
    if (!result.canceled) setImages([...images, ...result.assets]);
  };

  const removeImage = (index: number) => {
    const newImages = [...images];
    newImages.splice(index, 1);
    setImages(newImages);
  };

  const viewImage = (uri: string) => {
    setActiveImage(uri);
    setModalVisible(true);
  };

  const onPreSubmit = () => {
    if (!title) return showAlert('warning', 'ข้อมูลไม่ครบ', 'กรุณาระบุ "หัวข้องาน"');
    if (!selectedEmployee) return showAlert('warning', 'ข้อมูลไม่ครบ', 'กรุณาเลือก "พนักงานผู้รับผิดชอบ"');
    if (!isValidTime(timeText)) return showAlert('warning', 'รูปแบบเวลาไม่ถูกต้อง', 'กรุณาเลือกเวลาให้ถูกต้อง');
    showAlert('question', 'ยืนยันการมอบหมาย', 'คุณต้องการส่งงานนี้ใช่หรือไม่?');
  };

 const handleConfirmSubmit = async () => {
    setAlertVisible(false);
    if (alertConfig.type !== 'question') return;

    setSubmitting(true);
    const formData = new FormData();
    
    formData.append('action', 'submit_boss_task'); 
    formData.append('task_id', taskId);
    formData.append('title', title);
    formData.append('description', description);
    formData.append('assigned_to', selectedEmployee);
    formData.append('created_by', currentUserName);
    
    const submitDate = new Date(date);
    const dateStr = `${submitDate.getFullYear()}-${pad(submitDate.getMonth()+1)}-${pad(submitDate.getDate())} ${pad(submitDate.getHours())}:${pad(submitDate.getMinutes())}:00`;
    formData.append('due_date', dateStr);

    if (images.length > 0) {
        images.forEach((img, index) => {
            const uriParts = img.uri.split('.');
            const fileType = uriParts[uriParts.length - 1];
            // @ts-ignore
            formData.append('attachments[]', {
                uri: img.uri,
                name: `photo_${index}.${fileType}`,
                type: `image/${fileType}`,
            });
        });
    }

    try {
      const res = await axios.post(`${API_BASE}/api_tasks.php`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      if (res.data.status === 'success') {
        setTimeout(() => {
            showAlert('success', 'บันทึกสำเร็จ', 'มอบหมายงานเรียบร้อยแล้ว');
            setTitle(''); 
            setDescription(''); 
            setImages([]); 
            setSelectedEmployee(''); 
            fetchData(); 
        }, 500); 
      } else {
        setTimeout(() => showAlert('error', 'บันทึกไม่สำเร็จ', res.data.message || 'ระบบไม่สามารถบันทึกงานได้'), 500);
      }
    } catch (error) {
      console.error("Submit Error: ", error);
      setTimeout(() => showAlert('error', 'เกิดข้อผิดพลาด', 'ส่งข้อมูลไม่สำเร็จ โปรดตรวจสอบการเชื่อมต่ออินเทอร์เน็ต'), 500);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6366F1" />
        <Text style={styles.loadingText}>กำลังโหลดข้อมูล...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={theme.card} />
      <View style={styles.headerBar}>
          <View>
            <Text style={styles.headerTitle}>สั่งงาน/มอบหมายงาน</Text>
            <Text style={styles.headerSubtitle}>มอบหมายงานและติดตามงาน</Text>
          </View>
          <View style={styles.headerIconBg}>
            <Briefcase size={20} color="#6366F1" />
          </View>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{flex: 1}}>
        <ScrollView style={styles.content} contentContainerStyle={{paddingBottom: 140}} showsVerticalScrollIndicator={false}>
          
          <View style={styles.card}>
            <View style={styles.sectionHeader}>
                <View style={[styles.iconBox, { backgroundColor: isDark ? 'rgba(99, 102, 241, 0.2)' : '#EEF2FF' }]}><FileText size={20} color="#6366F1" /></View>
                <Text style={styles.sectionTitle}>รายละเอียดงาน</Text>
            </View>
            <Text style={styles.fieldLabel}>หัวข้องาน <Text style={styles.req}>*</Text></Text>
            <TextInput style={styles.input} placeholder="ระบุชื่อหรือหัวข้องาน..." value={title} onChangeText={setTitle} placeholderTextColor={theme.textSecondary} />
            <Text style={styles.fieldLabel}>รายละเอียดเพิ่มเติม</Text>
            <TextInput style={[styles.input, styles.textArea]} placeholder="อธิบายรายละเอียด คำสั่ง หรือหมายเหตุ..." multiline numberOfLines={4} value={description} onChangeText={setDescription} textAlignVertical="top" placeholderTextColor={theme.textSecondary} />
          </View>

          <View style={styles.card}>
            <View style={styles.rowBetween}>
                <View style={styles.rowCenter}>
                    <View style={[styles.iconBox, { backgroundColor: isDark ? 'rgba(16, 185, 129, 0.2)' : '#F0FDF4' }]}><ImageIcon size={20} color="#10B981" /></View>
                    <Text style={styles.sectionTitle}>รูปภาพแนบ <Text style={styles.counterText}>({images.length})</Text></Text>
                </View>
            </View>
            <View style={styles.imageSection}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.imgScrollContent}>
                    <TouchableOpacity style={styles.addBtn} onPress={pickImage}>
                        <View style={styles.plusIconBg}><ImageIcon color="#6366F1" size={24} /></View>
                        <Text style={styles.addBtnText}>เพิ่มรูป</Text>
                    </TouchableOpacity>
                    {images.map((img, index) => (
                        <View key={index} style={styles.imgWrapper}>
                            <TouchableOpacity onPress={() => viewImage(img.uri)} activeOpacity={0.8}>
                                <Image source={{ uri: img.uri }} style={styles.imgPreview} />
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.delImgBtn} onPress={() => removeImage(index)}><X size={12} color="#FFF" /></TouchableOpacity>
                        </View>
                    ))}
                </ScrollView>
            </View>
          </View>

          {/* เลือกบริษัท */}
          <View style={styles.card}>
            <View style={styles.sectionHeader}>
                <View style={[styles.iconBox, { backgroundColor: isDark ? 'rgba(249, 115, 22, 0.2)' : '#FFF7ED' }]}><Building2 size={20} color="#F97316" /></View>
                <Text style={styles.sectionTitle}>เลือกบริษัท</Text>
            </View>
            
            <View style={styles.companyGridContainer}>
              {companies.map((comp) => {
                const isActive = selectedCompanyId == comp.id;
                
                // ✅ ดึงข้อมูล Theme โดยอิงจาก ID ที่ได้จาก PHP (6, 2, 3, 5)
                const themeConfig = getCompanyTheme(comp.id);
                const borderColor = isActive ? themeConfig.color : 'transparent';
                
                return (
                  <TouchableOpacity 
                    key={comp.id} 
                    style={[
                        styles.compItemGrid, 
                        isActive && { borderColor: borderColor, backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#FAFAFA' }
                    ]}
                    onPress={() => { setSelectedCompanyId(comp.id); setSelectedEmployee(''); }}
                    activeOpacity={0.7}
                  >
                    <View style={styles.compLogoContainerGrid}>
                        {/* 🛑 บังคับใช้รูปภาพจาก Config ในเครื่องเท่านั้น */}
                        <Image source={{ uri: themeConfig.logo }} style={styles.compLogoImg} resizeMode="contain" />
                    </View>
                    
                    <Text numberOfLines={1} style={[styles.compNameGrid, isActive && { color: borderColor, fontWeight:'700' }]}>
                        {comp.company_name || themeConfig.name}
                    </Text>

                    {isActive && (
                        <View style={[styles.activeBadgeGrid, { backgroundColor: borderColor }]}>
                            <CheckCircle2 size={12} color="#FFF" />
                        </View>
                    )}
                  </TouchableOpacity>
                )
              })}
            </View>
          </View>

          {/* เลือกพนักงาน */}
          <View style={styles.card}>
            <View style={styles.rowBetween}>
                <View style={styles.rowCenter}>
                    <View style={[styles.iconBox, { backgroundColor: isDark ? 'rgba(168, 85, 247, 0.2)' : '#F3E8FF' }]}><Users size={20} color="#A855F7" /></View>
                    <Text style={styles.sectionTitle}>เลือกพนักงาน <Text style={styles.req}>*</Text></Text>
                </View>
                <View style={styles.searchPill}>
                    <Search size={14} color={theme.textSecondary} />
                    <TextInput style={styles.searchInputField} placeholder="ค้นหา..." value={searchText} onChangeText={setSearchText} placeholderTextColor={theme.textSecondary} />
                </View>
            </View>

            <View style={styles.employeeListContainer}>
                {filteredEmployees.length === 0 ? (
                    <View style={styles.emptyStateBox}>
                        <Users size={32} color={theme.textSecondary} />
                        <Text style={styles.emptyStateText}>ไม่พบพนักงานในบริษัทนี้</Text>
                    </View>
                ) : (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalScrollPadding}>
                        {filteredEmployees.map((emp, idx) => {
                            const isSelected = selectedEmployee === emp.value;
                            return (
                                <TouchableOpacity key={idx} style={[styles.empCardNew, isSelected && styles.empCardNewActive]} onPress={() => setSelectedEmployee(emp.value)} activeOpacity={0.8}>
                                    <View style={[styles.empAvatarNew, isSelected && {backgroundColor: '#6366F1'}]}><Text style={[styles.empInitialNew, isSelected && {color:'#FFF'}]}>{emp.label.charAt(0)}</Text></View>
                                    <Text numberOfLines={1} style={[styles.empNameNew, isSelected && {color: '#6366F1'}]}>{emp.label}</Text>
                                    <Text numberOfLines={1} style={styles.empRole}>พนักงาน</Text>
                                    {isSelected && <View style={styles.empSelectedBorder} />}
                                </TouchableOpacity>
                            )
                        })}
                    </ScrollView>
                )}
            </View>
          </View>

          {/* กำหนดส่ง */}
          <View style={styles.card}>
            <View style={styles.sectionHeader}>
                <View style={[styles.iconBox, { backgroundColor: isDark ? 'rgba(6, 182, 212, 0.2)' : '#ECFEFF' }]}><CalendarClock size={20} color="#06B6D4" /></View>
                <Text style={styles.sectionTitle}>กำหนดส่งงาน (Deadline)</Text>
            </View>
            
            <View style={styles.dateTimeContainer}>
                <TouchableOpacity style={styles.datePickerBtn} onPress={() => setShowDatePicker(true)}>
                    <View>
                        <Text style={styles.pickerLabel}>วันที่กำหนด</Text>
                        <Text style={styles.pickerValue}>{date.toLocaleDateString('th-TH', {day: 'numeric', month: 'long', year: 'numeric'})}</Text>
                    </View>
                    <ChevronRight size={20} color={theme.textSecondary} />
                </TouchableOpacity>

                <View style={styles.divider} />

                <TouchableOpacity style={styles.datePickerBtn} onPress={() => setShowTimePicker(true)}>
                    <View style={{flex: 1}}>
                        <Text style={styles.pickerLabel}>เวลา (HH:MM)</Text>
                        <Text style={styles.timeValueText}>{timeText} น.</Text>
                    </View>
                    <Clock size={20} color={theme.textSecondary} />
                </TouchableOpacity>
            </View>

            {showDatePicker && (<DateTimePicker value={date} mode="date" display="spinner" onChange={onChangeDate} themeVariant={isDark ? "dark" : "light"} />)}
            {showTimePicker && (<DateTimePicker value={date} mode="time" is24Hour={true} display="spinner" onChange={onChangeTime} themeVariant={isDark ? "dark" : "light"} />)}
          </View>

        </ScrollView>

        <View style={styles.bottomBar}>
          <TouchableOpacity style={[styles.mainButton, submitting && styles.btnDisabled]} onPress={onPreSubmit} disabled={submitting} activeOpacity={0.8}>
            {submitting ? <ActivityIndicator color="#fff" /> : (
              <>
                <Text style={styles.mainButtonText}>ยืนยันการมอบหมาย</Text>
                <View style={styles.btnIconBg}><Send color="#10B981" size={18} fill="#10B981" /></View>
              </>
            )}
          </TouchableOpacity>
        </View>

        <CustomAlert visible={alertVisible} type={alertConfig.type} title={alertConfig.title} message={alertConfig.message} onCancel={closeAlert} onConfirm={handleConfirmSubmit} isDark={isDark} />

        <Modal visible={modalVisible} transparent={true} animationType="fade">
            <View style={styles.modalBackdrop}>
                <BlurView intensity={isDark ? 90 : 50} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFill} />
                <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setModalVisible(false)}><X size={28} color={theme.text} /></TouchableOpacity>
                {activeImage && (<Image source={{ uri: activeImage }} style={styles.modalFullImage} resizeMode="contain" />)}
            </View>
        </Modal>

      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// --- Styles Generator ---
const getStyles = (isDark: boolean) => {
  const theme = isDark ? Colors.dark : Colors.light;

  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.background }, 
    content: { padding: 16 },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.background },
    loadingText: { marginTop: 12, color: theme.textSecondary, fontSize: 16, fontWeight: '500' },
    
    headerBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, backgroundColor: theme.card, borderBottomWidth: 1, borderBottomColor: theme.border },
    headerTitle: { fontSize: 20, fontWeight: '800', color: theme.text },
    headerSubtitle: { fontSize: 13, color: theme.textSecondary, marginTop: 2 },
    headerIconBg: { width: 40, height: 40, borderRadius: 20, backgroundColor: isDark ? 'rgba(99, 102, 241, 0.2)' : '#EEF2FF', alignItems: 'center', justifyContent: 'center' },
    
    card: { backgroundColor: theme.card, borderRadius: 20, padding: 20, marginBottom: 20, shadowColor: '#000', shadowOpacity: isDark ? 0.3 : 0.05, shadowRadius: 10, shadowOffset: {width: 0, height: 4}, elevation: 3 },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
    rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    rowCenter: { flexDirection: 'row', alignItems: 'center' },
    iconBox: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
    sectionTitle: { fontSize: 16, fontWeight: '700', color: theme.text },
    counterText: { fontSize: 14, color: theme.textSecondary, fontWeight: '500' },
    req: { color: '#EF4444' },
    
    fieldLabel: { fontSize: 14, fontWeight: '600', color: theme.textSecondary, marginBottom: 8, marginLeft: 4 },
    input: { backgroundColor: theme.inputBg, borderRadius: 14, padding: 16, fontSize: 16, color: theme.text, marginBottom: 16, borderWidth: 1, borderColor: theme.border },
    textArea: { height: 100, marginBottom: 0 },
    
    searchPill: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.inputBg, borderRadius: 20, paddingHorizontal: 12, height: 36, borderWidth: 1, borderColor: theme.border },
    searchInputField: { marginLeft: 8, fontSize: 13, color: theme.text, width: 100 },
    
    imageSection: { marginTop: -4 },
    imgScrollContent: { paddingVertical: 4 },
    addBtn: { width: 90, height: 90, borderRadius: 16, borderWidth: 1, borderColor: isDark ? '#334155' : '#E0E7FF', borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center', backgroundColor: theme.subBlockBg, marginRight: 12 },
    plusIconBg: { width: 32, height: 32, borderRadius: 16, backgroundColor: isDark ? 'rgba(99, 102, 241, 0.2)' : '#EEF2FF', alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
    addBtnText: { fontSize: 12, color: '#6366F1', fontWeight: '600' },
    imgWrapper: { position: 'relative', marginRight: 12, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 },
    imgPreview: { width: 90, height: 90, borderRadius: 16, backgroundColor: theme.inputBg },
    delImgBtn: { position: 'absolute', top: -6, right: -6, backgroundColor: '#EF4444', width: 22, height: 22, borderRadius: 11, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: theme.card },
    
    horizontalScrollPadding: { paddingRight: 20 },
    employeeListContainer: { minHeight: 130 },
    emptyStateBox: { alignItems: 'center', justifyContent: 'center', padding: 20, width: '100%', borderWidth: 1, borderColor: theme.border, borderRadius: 16, borderStyle: 'dashed' },
    emptyStateText: { marginTop: 8, color: theme.textSecondary, fontSize: 14 },
    
    empCardNew: { width: 110, padding: 12, borderRadius: 18, backgroundColor: theme.subBlockBg, marginRight: 12, alignItems: 'center', borderWidth: 1, borderColor: theme.border },
    empCardNewActive: { backgroundColor: isDark ? '#1E293B' : '#FFF', borderColor: '#6366F1', shadowColor: '#6366F1', shadowOpacity: 0.15, shadowRadius: 8, elevation: 4 },
    empAvatarNew: { width: 48, height: 48, borderRadius: 24, backgroundColor: isDark ? '#334155' : '#E2E8F0', justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
    empInitialNew: { fontSize: 20, fontWeight: '700', color: theme.textSecondary },
    empNameNew: { fontSize: 13, color: theme.text, fontWeight: '600', marginBottom: 2, textAlign: 'center' },
    empRole: { fontSize: 11, color: theme.textSecondary },
    empSelectedBorder: { position: 'absolute', bottom: -6, width: 20, height: 4, borderRadius: 2, backgroundColor: '#6366F1' },
    
    dateTimeContainer: { backgroundColor: theme.inputBg, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: theme.border },
    datePickerBtn: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
    divider: { height: 1, backgroundColor: theme.border, marginHorizontal: 16 },
    pickerLabel: { fontSize: 12, color: theme.textSecondary, marginBottom: 4 },
    pickerValue: { fontSize: 16, fontWeight: '700', color: theme.text },
    timeValueText: { fontSize: 16, fontWeight: '700', color: theme.text, marginTop: 2 },
    
    bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: theme.bottomBar, borderTopWidth: 1, borderTopColor: theme.border, paddingHorizontal: 20, paddingTop: 16, paddingBottom: Platform.OS === 'ios' ? 24 : 16 },
    mainButton: { backgroundColor: '#10B981', borderRadius: 16, height: 56, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, shadowColor: '#10B981', shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: {width: 0, height: 5}, elevation: 6 },
    btnDisabled: { opacity: 0.7, backgroundColor: '#94A3B8' },
    mainButtonText: { color: '#FFF', fontSize: 18, fontWeight: '700' },
    btnIconBg: { width: 36, height: 36, borderRadius: 12, backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center' },
    
    modalBackdrop: { flex: 1, backgroundColor: theme.modalOverlay, justifyContent: 'center', alignItems: 'center' },
    modalFullImage: { width: width * 0.95, height: '80%', borderRadius: 12 },
    modalCloseBtn: { position: 'absolute', top: 60, right: 24, padding: 8, backgroundColor: theme.inputBg, borderRadius: 20, zIndex: 10 },
    
    companyGridContainer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
    compItemGrid: { width: '48%', aspectRatio: 1.3, backgroundColor: theme.inputBg, borderRadius: 16, borderWidth: 2, borderColor: theme.border, justifyContent: 'center', alignItems: 'center', marginBottom: 12, position: 'relative' },
    compLogoContainerGrid: { width: 48, height: 48, borderRadius: 12, backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : '#FFF', justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
    compLogoImg: { width: 32, height: 32 },
    compNameGrid: { fontSize: 13, color: theme.textSecondary, fontWeight: '500', textAlign: 'center', paddingHorizontal: 4 },
    activeBadgeGrid: { position: 'absolute', top: 8, right: 8, width: 20, height: 20, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  });
};

// --- CustomAlert Styles ---
const alertStyles = StyleSheet.create({
    overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
    alertBox: { width: '100%', maxWidth: 340, borderRadius: 28, padding: 28, alignItems: 'center', elevation: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.25, shadowRadius: 20 },
    alertIconArea: { width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
    alertTitle: { fontSize: 22, fontWeight: '800', marginBottom: 10, textAlign: 'center' },
    alertMessage: { fontSize: 15, textAlign: 'center', marginBottom: 28, lineHeight: 24 },
    alertBtnRow: { flexDirection: 'row', gap: 12, width: '100%' },
    alertBtnCancel: { flex: 1, paddingVertical: 14, borderRadius: 14, alignItems: 'center' },
    alertBtnCancelText: { fontSize: 16, fontWeight: '700' },
    alertBtnConfirm: { flex: 1.5, paddingVertical: 14, borderRadius: 14, alignItems: 'center', shadowColor: '#6366F1', shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
    alertBtnConfirmText: { fontSize: 16, fontWeight: '700', color: '#FFF' },
});