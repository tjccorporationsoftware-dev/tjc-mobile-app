
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useState, useEffect, useCallback } from 'react';
import {
    StyleSheet, Text, View, FlatList, TouchableOpacity,
    RefreshControl, ActivityIndicator, Alert, SafeAreaView, Platform,
    Image, Modal, ScrollView, TextInput, KeyboardAvoidingView, Dimensions, StatusBar, DeviceEventEmitter
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import moment from 'moment';
import 'moment/locale/th';
import {
    Loader2, CheckCircle2, Inbox, FileText, LayoutDashboard,
    Clock, Calendar, Crown, Image as ImageIcon, History, Send, Play,
    Paperclip, Trash2, Camera, ChevronRight, Briefcase, User,
    AlertTriangle, Info, AlertCircle, Users, FileBarChart,
    Flag, Building2, ChevronDown, CalendarDays, Filter, ChevronLeft, X
} from 'lucide-react-native';

// ✅ Config
import { API_BASE } from '../../constants/config';
const API_URL = `${API_BASE}/api_tasks.php`;

// ✅ Default User
const DEFAULT_USER = 'กำลังโหลด...';


// ✅ Palette
const COLORS = {
    background: '#F1F5F9',
    card: '#FFFFFF',
    textPrimary: '#1E293B',
    textSecondary: '#64748B',
    primary: '#5B4EF5',
    primaryLight: '#EEF2FF',
    success: '#10B981', successLight: '#ECFDF5',
    warning: '#F59E0B', warningLight: '#FFFBEB',
    danger: '#EF4444', dangerLight: '#FEF2F2',
    info: '#3B82F6', infoLight: '#EFF6FF',
    border: '#E2E8F0',
    inputBg: '#F8FAFC'
};

const SCREEN_WIDTH = Dimensions.get('window').width;

// --------------------------------------------------------
// ✅ Type Definitions
// --------------------------------------------------------

interface Task {
    task_id: string;
    title: string;
    description: string;
    status: string;
    assigned_to: string;
    created_by: string;
    company_display: string;
    assign_date: string;
    due_date: string;
    started_at: string;
    completed_at: string;
    progress_note: string;
    submission_note: string;
    work_note: string;
    submission_attachments: any;
    work_files: any;
    attachments: any;
   is_read_admin?: number | string; 
    creator_unread?: number | string;
}

interface AlertConfig {
    title: string;
    message: string;
    type: 'success' | 'error' | 'warning' | 'info';
}

interface ConfirmConfig {
    title: string;
    message: string;
    type: 'success' | 'danger' | 'warning' | 'info';
    confirmText?: string;
    action?: () => void;
}

interface Company {
    id: string;
    company_name: string;
}

// --------------------------------------------------------
// ✅ Sub-Components
// --------------------------------------------------------

interface CustomAlertModalProps {
    visible: boolean;
    config: AlertConfig;
    onClose: () => void;
}

const CustomAlertModal = ({ visible, config, onClose }: CustomAlertModalProps) => {
    if (!visible) return null;
    const { title, message, type } = config;
    let mainColor = COLORS.primary;
    let IconComponent = Info;
    let bgLight = COLORS.primaryLight;

    if (type === 'error') { mainColor = COLORS.danger; IconComponent = AlertCircle; bgLight = COLORS.dangerLight; }
    else if (type === 'success') { mainColor = COLORS.success; IconComponent = CheckCircle2; bgLight = COLORS.successLight; }
    else if (type === 'warning') { mainColor = COLORS.warning; IconComponent = AlertTriangle; bgLight = COLORS.warningLight; }

    return (
        <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
            <View style={styles.confirmOverlay}>
                <View style={styles.confirmContainer}>
                    <View style={[styles.confirmIconBox, { backgroundColor: bgLight }]}>
                        <IconComponent size={32} color={mainColor} />
                    </View>
                    <Text style={styles.confirmTitle}>{title}</Text>
                    <Text style={styles.confirmMessage}>{message}</Text>

                    <TouchableOpacity
                        activeOpacity={0.8}
                        style={{
                            backgroundColor: mainColor,
                            width: '100%',
                            paddingVertical: 14,
                            borderRadius: 12,
                            alignItems: 'center',
                            justifyContent: 'center',
                            marginTop: 20,
                            shadowColor: mainColor,
                            shadowOpacity: 0.3,
                            shadowRadius: 5,
                            elevation: 3
                        }}
                        onPress={onClose}
                    >
                        <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#FFF' }}>ตกลง</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
};

interface CustomConfirmModalProps {
    visible: boolean;
    config: ConfirmConfig;
    onCancel: () => void;
    onConfirm: () => void;
}

const CustomConfirmModal = ({ visible, config, onCancel, onConfirm }: CustomConfirmModalProps) => {
    if (!visible) return null;
    const { title, message, type, confirmText } = config;
    let mainColor = COLORS.primary;
    let IconComponent = Info;
    let bgLight = COLORS.primaryLight;

    if (type === 'danger') { mainColor = COLORS.danger; IconComponent = Trash2; bgLight = COLORS.dangerLight; }
    else if (type === 'success') { mainColor = COLORS.success; IconComponent = CheckCircle2; bgLight = COLORS.successLight; }
    else if (type === 'warning') { mainColor = COLORS.warning; IconComponent = AlertTriangle; bgLight = COLORS.warningLight; }

    return (
        <Modal transparent visible={visible} animationType="fade" onRequestClose={onCancel}>
            <View style={styles.confirmOverlay}>
                <View style={styles.confirmContainer}>
                    <View style={[styles.confirmIconBox, { backgroundColor: bgLight }]}>
                        <IconComponent size={32} color={mainColor} />
                    </View>
                    <Text style={styles.confirmTitle}>{title}</Text>
                    <Text style={styles.confirmMessage}>{message}</Text>
                    <View style={styles.confirmBtnRow}>
                        <TouchableOpacity style={styles.btnCancel} onPress={onCancel}>
                            <Text style={styles.btnCancelText}>ยกเลิก</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.btnConfirm, { backgroundColor: mainColor }]} onPress={onConfirm}>
                            <Text style={styles.btnConfirmText}>{confirmText || 'ยืนยัน'}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
};

interface StatusPillProps {
    status: string;
    large?: boolean;
}

const StatusPill = ({ status, large }: StatusPillProps) => {
    let bg = COLORS.background, text = COLORS.textSecondary, icon = null;
    if (status === 'มอบหมาย') { bg = COLORS.infoLight; text = COLORS.info; icon = <Inbox size={large ? 14 : 12} color={text} />; }
    else if (status === 'ดำเนินการ') { bg = COLORS.warningLight; text = COLORS.warning; icon = <Loader2 size={large ? 14 : 12} color={text} />; }
    else if (status === 'สำเร็จ') { bg = COLORS.successLight; text = COLORS.success; icon = <CheckCircle2 size={large ? 14 : 12} color={text} />; }

    return (
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: bg, paddingHorizontal: large ? 12 : 10, paddingVertical: large ? 6 : 4, borderRadius: 20, gap: 6 }}>
            {icon}
            <Text style={{ fontSize: large ? 13 : 11, fontWeight: '700', color: text }}>{status}</Text>
        </View>
    );
};

interface StatCardProps {
    label: string;
    value: number;
    icon: React.ReactElement<any>;
    active: boolean;
    onPress: () => void;
    color: string;
}

const StatCard = ({ label, value, icon, active, onPress, color }: StatCardProps) => (
    <TouchableOpacity
        activeOpacity={0.7}
        style={[
            styles.statCard,
            active
                ? { borderColor: color, borderWidth: 2, backgroundColor: '#FFF' }
                : { borderColor: 'transparent', borderWidth: 1, backgroundColor: '#FFF' }
        ]}
        onPress={onPress}
    >
        <View style={[styles.statIconBox, { backgroundColor: color + '15' }]}>
            {React.cloneElement(icon, { color: color })}
        </View>
        <View>
            <Text style={styles.statLabel}>{label}</Text>
            <Text style={[styles.statValue, { color: COLORS.textPrimary }]}>{value}</Text>
        </View>
    </TouchableOpacity>
);

interface TimelineItemProps {
    title: string;
    date: string;
    isLast?: boolean;
    isDone: boolean;
    color: string;
}

const TimelineItem = ({ title, date, isLast, isDone, color }: TimelineItemProps) => (
    <View style={{ flexDirection: 'row', minHeight: 50 }}>
        <View style={{ alignItems: 'center', width: 24, marginRight: 15 }}>
            <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: isDone ? color : COLORS.border, borderWidth: 3, borderColor: '#FFF', shadowColor: isDone ? color : "#000", shadowOpacity: 0.2, shadowRadius: 2, elevation: 2 }} />
            {!isLast && <View style={{ width: 2, flex: 1, backgroundColor: isDone ? color + '50' : COLORS.border, marginVertical: 2 }} />}
        </View>
        <View style={{ flex: 1, paddingBottom: 15, marginTop: -3 }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: isDone ? COLORS.textPrimary : COLORS.textSecondary }}>{title}</Text>
            <Text style={{ fontSize: 12, color: COLORS.textSecondary, marginTop: 4 }}>{date ? moment(date).format('D MMM HH:mm') : '-'}</Text>
        </View>
    </View>
);

const renderAssigneeName = (name: string) => {
    if (!name) return <Text style={styles.infoValue}>-</Text>;
    if (name.includes('(') && name.includes(')')) {
        const parts = name.split('(');
        return (
            <View style={{ flex: 1 }}>
                <Text style={styles.infoValue}>{parts[0].trim()}</Text>
                <Text style={[styles.infoValue, { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 }]}>({parts[1].trim()}</Text>
            </View>
        );
    }
    return <Text style={styles.infoValue}>{name}</Text>;
};

// --------------------------------------------------------
// ✅ Main Component
// --------------------------------------------------------

export default function BossDashboard() {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [stats, setStats] = useState({ total: 0, ordered: 0, process: 0, success: 0 });
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [userName, setUserName] = useState(DEFAULT_USER);
    const [userRole, setUserRole] = useState('');

    const [userId, setUserId] = useState(''); // ✅ 2. เพิ่มบรรทัดนี้
    const [readIds, setReadIds] = useState<string[]>([]); // ✅ เพิ่มเพื่อเก็บ ID ที่พนักงานกดอ่านแล้ว

    const [filterStatus, setFilterStatus] = useState('');
    const [filterCompany, setFilterCompany] = useState<Company>({ id: 'all', company_name: 'ทั้งหมด' });
    const [filterDate, setFilterDate] = useState(''); // แก้จาก moment().format(...) เป็นค่าว่าง
    const [companies, setCompanies] = useState<Company[]>([]);

    const [showCompanyModal, setShowCompanyModal] = useState(false);
    const [showCalendarModal, setShowCalendarModal] = useState(false);
    const [displayMonth, setDisplayMonth] = useState(moment());

    const [modalVisible, setModalVisible] = useState(false);
    const [selectedTask, setSelectedTask] = useState<Task | null>(null);
    const [progressMsg, setProgressMsg] = useState('');
    const [workNote, setWorkNote] = useState('');
    const [workImages, setWorkImages] = useState<ImagePicker.ImagePickerAsset[]>([]);
    const [actionLoading, setActionLoading] = useState(false);
    const [fullImage, setFullImage] = useState<string | null>(null);
    const [confirmVisible, setConfirmVisible] = useState(false);
    const [confirmConfig, setConfirmConfig] = useState<ConfirmConfig>({ title: '', message: '', type: 'info', action: undefined, confirmText: 'ยืนยัน' });
    const [alertVisible, setAlertVisible] = useState(false);
    const [alertConfig, setAlertConfig] = useState<AlertConfig>({ title: '', message: '', type: 'success' });

    const showAlert = (title: string, message: string, type: AlertConfig['type'] = 'success') => { setAlertConfig({ title, message, type }); setAlertVisible(true); };
    const showConfirm = (title: string, message: string, type: ConfirmConfig['type'], confirmText: string, action: () => void) => { setConfirmConfig({ title, message, type, confirmText, action }); setConfirmVisible(true); };
    const handleConfirmAction = () => { setConfirmVisible(false); if (confirmConfig.action) confirmConfig.action(); };
    
   const fetchUserProfile = async () => {
    try {
        // 1. ลองดึงจาก 'username' ตรงๆ
        let storedUsername = await AsyncStorage.getItem('username');
        
        // 2. ถ้าไม่มี ลองดึงจากก้อน 'user' (เผื่อระบบเก็บเป็น Object)
        if (!storedUsername) {
            const userData = await AsyncStorage.getItem('user');
            if (userData) {
                const parsed = JSON.parse(userData);
                storedUsername = parsed.username;
            }
        }

        if (!storedUsername) {
            setUserName('ไม่พบชื่อผู้ใช้');
            return;
        }

        // ยิงไปที่ api_mobile.php (เพราะข้อมูล Profile ส่วนใหญ่อยู่ไฟล์หลัก)
        // หรือถ้าคุณย้าย get_user_profile ไป api_tasks.php แล้ว ก็ใช้ API_URL ได้ครับ
        const response = await fetch(`${API_BASE}/api_mobile.php?action=get_user_profile&username=${storedUsername}`);
        const json = await response.json();
        
        if (json.id) {
            setUserId(String(json.id)); 
            setUserName(json.fullname);
            setUserRole(json.role?.toLowerCase() || 'staff');
        }
    } catch (error) {
        console.log('Profile Error:', error);
    }
};;

    const loadInitialData = async () => {
        setLoading(true);
        try {
            let companyData: Company[] = [{ id: 'all', company_name: 'ทั้งหมด' }];
            try {
                const compRes = await fetch(`${API_URL}?action=get_companies`);
                const compJson = await compRes.json();
                if (compJson.status === 'success' && Array.isArray(compJson.data)) {
                    companyData = [...companyData, ...compJson.data];
                }
            } catch (e) {
                companyData = [{ id: 'all', company_name: 'ทั้งหมด' }, { id: '1', company_name: 'TJC Corporation' }, { id: '2', company_name: 'Marketing Tech' }];
            }
            setCompanies(companyData);
            // ✅ แก้ไข: ลบ fetchDashboardData() ออกจากที่นี่ เพื่อป้องกันการเรียกก่อนได้ Role
        } catch (error) { console.log('Global Load Error:', error); }
        finally { setLoading(false); setRefreshing(false); }
    };

    const fetchDashboardData = async () => {
        if (!userRole || !userName || userName === DEFAULT_USER) return;

        try {
            const params = new URLSearchParams({
                action: 'get_boss_dashboard',
                user_name: userName,
                role: userRole,
                status: filterStatus,
                company_id: filterCompany?.id === 'all' ? '' : filterCompany?.id,
                date: filterDate
            });
            const response = await fetch(`${API_URL}?${params.toString()}`);
            const json = await response.json();
            if (json.status === 'success') {
                setTasks(json.tasks || []);
                setStats(json.stats || { total: 0, ordered: 0, process: 0, success: 0 });
            } else { setTasks([]); }
        } catch (error) { console.log('Fetch Dashboard Error:', error); }
    };

  useEffect(() => { 
    fetchUserProfile(); 
    loadInitialData(); 
    // ✅ เพิ่มส่วนนี้เพื่อโหลดรายการที่เคยอ่านแล้วจากมือถือ
    const loadReadIds = async () => {
        const storageKey = `READ_BOSS_TASK_IDS_${userId}`;
        const data = await AsyncStorage.getItem(storageKey);
        if (data) setReadIds(JSON.parse(data));
    };
    if (userId) loadReadIds();
}, [userId]);

    // ✅ แก้ไข: เพิ่ม userRole, userName, loading เข้าไปใน dependency เพื่อให้มันทำงานทันทีเมื่อข้อมูลพร้อม
    useEffect(() => {
        if (!loading && userRole && userName !== DEFAULT_USER) {
            fetchDashboardData();
        }
    }, [filterStatus, filterCompany, filterDate, userRole, userName, loading]);

    const onRefresh = useCallback(() => { setRefreshing(true); fetchUserProfile(); loadInitialData(); }, [filterStatus, filterCompany, filterDate]);


const handleReadTask = async (taskId: string) => {
    if (!userId) return;
    try {
        const storageKey = `READ_BOSS_TASK_IDS_${userId}`;
        const readData = await AsyncStorage.getItem(storageKey);
        let currentIds = readData ? JSON.parse(readData) : [];

        if (!currentIds.includes(String(taskId))) {
            const newIds = [...currentIds, String(taskId)];
            await AsyncStorage.setItem(storageKey, JSON.stringify(newIds));
            setReadIds(newIds); // ✅ อัพเดตสถานะในหน้าจอทันที
            DeviceEventEmitter.emit('updateBossBadge'); // บอก Sidebar ให้ลดเลข
        }
    } catch (e) { console.log(e); }
};


 const openTaskModal = async (task: Task) => {
    // 1. เปิด Modal ปกติ
    setSelectedTask(task);
    setModalVisible(true);
    setProgressMsg('');
    setWorkNote('');
    setWorkImages([]);

    // 2. ทำการบันทึกว่า "พนักงานอ่านแล้ว" (ลบป้าย New สีส้ม ของพนักงาน)
    handleReadTask(task.task_id);

    // 3. ยิง API บอกว่า "บอส/แอดมิน อ่านอัปเดตแล้ว" (ลบป้ายแจ้งเตือนสีน้ำเงิน)
    if (userRole?.toLowerCase() === 'admin' || userRole?.toLowerCase() === 'ceo' || task.created_by === userName) {
        try {
            await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: `action=mark_creator_read&task_id=${task.task_id}`
            });
            
            // --- จุดที่เพิ่มใหม่: ทำให้ป้าย UPDATE หายไปจากหน้าจอทันทีโดยไม่ต้องรีเฟรช ---
            setTasks(prevTasks => prevTasks.map(t => 
               t.task_id === task.task_id ? { ...t, is_read_admin: 1 } : t
            ));

            // ส่งสัญญาณให้ _layout.tsx โหลดเลขแจ้งเตือนใหม่ (เลขจะลดลง)
            DeviceEventEmitter.emit('updateCreatorBadge');
        } catch (e) {
            console.log('Error marking creator read:', e);
        }
    }
};
    const pickImage = async () => { let result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsMultipleSelection: true, quality: 0.7, }); if (!result.canceled) setWorkImages([...workImages, ...result.assets]); };
    const removeImage = (index: number) => { const newImgs = [...workImages]; newImgs.splice(index, 1); setWorkImages(newImgs); };
    const handleDeleteTask = () => { showConfirm('ยืนยันลบงาน', 'คุณต้องการลบรายการงานนี้ถาวรหรือไม่?', 'danger', 'ลบงาน', () => submitAction('delete_task')); };
  const submitAction = async (actionType: string) => {
    if (!selectedTask) return;
    setActionLoading(true);
    try {
        const formData = new FormData();
        formData.append('action', actionType);
        formData.append('task_id', selectedTask.task_id);
        formData.append('user_name', userName); // ส่งชื่อคนทำไปด้วย

        if (actionType === 'update_progress') {
            formData.append('progress_msg', progressMsg);
        } else if (actionType === 'save_work') {
            formData.append('work_note', workNote);
            workImages.forEach((img, index) => {
                const uriParts = img.uri.split('.');
                const fileType = uriParts[uriParts.length - 1];
                // @ts-ignore
                formData.append('work_files[]', {
                    uri: img.uri,
                    name: `work_${index}.${fileType}`,
                    type: `image/${fileType}`
                });
            });
        }

        const response = await fetch(API_URL, {
            method: 'POST',
            body: formData,
            headers: { 
                'Accept': 'application/json',
                // ไม่ต้องใส่ Content-Type: multipart/form-data เพราะ fetch จะจัดการให้เองเมื่อใช้ FormData
            },
        });
        const json = await response.json();

        if (json.success) {
            // ส่งสัญญาณแจ้งเตือนบอส
            if (actionType !== 'delete_task') {
                await fetch(API_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: `action=set_admin_unread&task_id=${selectedTask.task_id}`
                });
            }
            showAlert('สำเร็จ', json.message, 'success');
            setModalVisible(false);
            fetchDashboardData(); // โหลดข้อมูลใหม่
        }
    } catch (e) {
        showAlert('Error', 'การเชื่อมต่อผิดพลาด', 'error');
    } finally {
        setActionLoading(false);
    }
};

    const renderCalendarModal = () => {
        const startOfMonth = (filterDate ? moment(filterDate) : displayMonth).clone().startOf('month');
        const startDay = startOfMonth.day();
        const daysInMonth = displayMonth.daysInMonth();
        const calendarDays = [];
        for (let i = 0; i < startDay; i++) { calendarDays.push(null); }
        for (let i = 1; i <= daysInMonth; i++) { calendarDays.push(i); }

        return (
            <Modal visible={showCalendarModal} transparent animationType="fade" onRequestClose={() => setShowCalendarModal(false)}>
                <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowCalendarModal(false)}>
                    <View style={styles.calendarContainer}>
                        <View style={styles.calendarHeader}>
                            <TouchableOpacity onPress={() => setDisplayMonth(displayMonth.clone().subtract(1, 'month'))} style={{ padding: 5 }}>
                                <ChevronLeft size={24} color={COLORS.textSecondary} />
                            </TouchableOpacity>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                                <Text style={styles.calendarTitle}>{displayMonth.format('MMMM')}</Text>
                                <Text style={styles.calendarYear}>{displayMonth.format('YYYY')}</Text>
                            </View>
                            <TouchableOpacity onPress={() => setDisplayMonth(displayMonth.clone().add(1, 'month'))} style={{ padding: 5 }}>
                                <ChevronRight size={24} color={COLORS.textSecondary} />
                            </TouchableOpacity>
                        </View>
                        <View style={styles.weekRow}>
                            {['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'].map((d, i) => (<Text key={i} style={styles.weekText}>{d}</Text>))}
                        </View>
                        <View style={styles.daysGrid}>
                            {calendarDays.map((day, index) => {
                                if (day === null) return <View key={index} style={styles.dayCell} />;
                                const thisDate = displayMonth.clone().date(day).format('YYYY-MM-DD');
                                const isSelected = filterDate !== '' && thisDate === filterDate;
                                const isToday = thisDate === moment().format('YYYY-MM-DD');
                                return (
                                    <TouchableOpacity key={index} style={[styles.dayCell, isSelected && styles.dayCellSelected, isToday && !isSelected && styles.dayCellToday]} onPress={() => { setFilterDate(thisDate); setShowCalendarModal(false); }}>
                                        <Text style={[styles.dayText, isSelected && { color: '#FFF', fontWeight: '700' }, isToday && !isSelected && { color: COLORS.primary, fontWeight: '700' }]}>{day}</Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    </View>
                </TouchableOpacity>
            </Modal>
        );
    };

    // ✅ REDESIGNED MODAL CONTENT 
    const renderModalContent = () => {
        if (!selectedTask) return null;

        const getImgUrl = (path: string) => {
            if (!path) return null;
            if (path.startsWith('http')) return path;
            const cleanPath = path.startsWith('/') ? path.substring(1) : path;
            return `${API_BASE}/${cleanPath}`;
        };

        const completionImages = selectedTask.submission_attachments || selectedTask.work_files || [];
        const assignmentImages = selectedTask.attachments || [];
        const getCleanName = (name: string) => name ? name.split('(')[0].trim() : '-';

        return (
            <ScrollView contentContainerStyle={{ padding: 25, paddingBottom: 80 }} showsVerticalScrollIndicator={false}>

                {/* Badge สถานะด้านบนขวา */}
                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 10 }}>
                    <StatusPill status={selectedTask.status} large />
                </View>

                {/* 1. Main Task Header */}
                <View style={styles.sectionContainer}>
                    <View style={styles.sectionHeader}>
                        <View style={[styles.sectionIcon, { backgroundColor: COLORS.primaryLight }]}>
                            <Flag size={18} color={COLORS.primary} />
                        </View>
                        <Text style={styles.sectionTitle}>หัวข้องานหลัก</Text>
                    </View>
                    <View style={styles.detailCard}>
                        <Text style={styles.modalTaskTitle}>{selectedTask.title || 'ไม่ได้ระบุหัวข้อ'}</Text>
                    </View>
                </View>

                {/* 2. Details */}
                <View style={styles.sectionContainer}>
                    <View style={styles.sectionHeader}>
                        <View style={[styles.sectionIcon, { backgroundColor: COLORS.warningLight }]}>
                            <FileText size={18} color={COLORS.warning} />
                        </View>
                        <Text style={styles.sectionTitle}>รายละเอียดคำสั่ง</Text>
                    </View>

                    <View style={styles.detailCard}>
                        <Text style={styles.descText}>{selectedTask.description || '-'}</Text>
                    </View>

                    <View style={{ marginTop: 12 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                            <Paperclip size={14} color={COLORS.textSecondary} />
                            <Text style={{ fontSize: 13, fontWeight: '600', color: COLORS.textSecondary }}>รูปภาพแนบ (ตอนสั่งงาน)</Text>
                        </View>
                        {assignmentImages.length > 0 ? (
                            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                                {assignmentImages.map((file: any, i: number) => (
                                    <TouchableOpacity key={i} onPress={() => setFullImage(getImgUrl(file.file_path || file))}>
                                        {/* @ts-ignore */}
                                        <Image source={{ uri: getImgUrl(file.file_path || file) }} style={styles.attachImg} />
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>
                        ) : (
                            <Text style={{ fontSize: 14, color: COLORS.textSecondary, marginLeft: 20 }}>-</Text>
                        )}
                    </View>
                </View>

                {/* 3. People */}
                <View style={styles.sectionContainer}>
                    <View style={styles.sectionHeader}>
                        <View style={[styles.sectionIcon, { backgroundColor: COLORS.infoLight }]}>
                            <Users size={18} color={COLORS.info} />
                        </View>
                        <Text style={styles.sectionTitle}>ผู้รับผิดชอบ & ผู้สั่งงาน</Text>
                    </View>
                    <View style={{ flexDirection: 'column', gap: 12 }}>
                        <View style={styles.infoCard}>
                            <Text style={styles.infoLabel}>ผู้รับผิดชอบ</Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 15, marginTop: 10 }}>
                                <View style={{
                                    width: 42, height: 42, borderRadius: 21,
                                    backgroundColor: COLORS.primary,
                                    justifyContent: 'center', alignItems: 'center',
                                    shadowColor: COLORS.primary, shadowOpacity: 0.2, shadowRadius: 3, elevation: 2
                                }}>
                                    <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#FFF' }}>
                                        {selectedTask.assigned_to ? selectedTask.assigned_to.charAt(0) : 'U'}
                                    </Text>
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={{ fontSize: 15, fontWeight: '700', color: COLORS.textPrimary }}>
                                        {getCleanName(selectedTask.assigned_to)}
                                    </Text>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                                        <Building2 size={14} color={COLORS.textSecondary} />
                                        <Text style={{ fontSize: 13, color: COLORS.textSecondary }}>
                                            {selectedTask.company_display || 'ไม่ระบุสังกัด'}
                                        </Text>
                                    </View>
                                </View>
                            </View>
                        </View>

                        <View style={styles.infoCard}>
                            <Text style={styles.infoLabel}>ผู้สั่งงาน</Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 15, marginTop: 10 }}>
                                <View style={{
                                    width: 42, height: 42, borderRadius: 21,
                                    backgroundColor: COLORS.warningLight,
                                    justifyContent: 'center', alignItems: 'center'
                                }}>
                                    <Crown size={20} color={COLORS.warning} />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={{ fontSize: 15, fontWeight: '700', color: COLORS.textPrimary }}>
                                        {selectedTask.created_by || 'Admin'}
                                    </Text>
                                    <Text style={{ fontSize: 13, color: COLORS.textSecondary, marginTop: 2 }}>
                                        ผู้มอบหมายงาน
                                    </Text>
                                </View>
                            </View>
                        </View>
                    </View>
                </View>

                {/* 4. Dates */}
                <View style={styles.sectionContainer}>
                    <View style={styles.sectionHeader}>
                        <View style={[styles.sectionIcon, { backgroundColor: '#F3E8FF' }]}>
                            <Calendar size={18} color="#9333EA" />
                        </View>
                        <Text style={styles.sectionTitle}>กำหนดการทำงาน</Text>
                    </View>
                    <View style={styles.rowGrid}>
                        <View style={styles.infoCard}>
                            <Text style={styles.infoLabel}>วันที่เริ่มงาน</Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 }}>
                                <Clock size={16} color={COLORS.textSecondary} />
                                <Text style={styles.infoValue}>{moment(selectedTask.assign_date).format('D MMM YY HH:mm')}</Text>
                            </View>
                        </View>
                        <View style={styles.infoCard}>
                            <Text style={styles.infoLabel}>กำหนดส่ง</Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 }}>
                                <Flag size={16} color={COLORS.danger} />
                                <Text style={[styles.infoValue, { color: COLORS.danger }]}>
                                    {selectedTask.due_date ? moment(selectedTask.due_date).format('D MMM YY HH:mm') : '-'}
                                </Text>
                            </View>
                        </View>
                    </View>
                </View>

                {/* 5. Progress Timeline - แสดงเสมอ */}
                <View style={styles.sectionContainer}>
                    <View style={styles.sectionHeader}>
                        <View style={[styles.sectionIcon, { backgroundColor: COLORS.successLight }]}>
                            <FileBarChart size={18} color={COLORS.success} />
                        </View>
                        <Text style={styles.sectionTitle}>ไทม์ไลน์ความคืบหน้า</Text>
                    </View>

                    <View style={{ paddingLeft: 10, borderLeftWidth: 2, borderLeftColor: '#F1F5F9', marginLeft: 10 }}>
                        <TimelineItem title="มอบหมายงาน" date={selectedTask.assign_date} isDone={true} color={COLORS.info} />
                        <TimelineItem title="เริ่มดำเนินการ" date={selectedTask.started_at} isDone={!!selectedTask.started_at} color={COLORS.warning} />
                        <TimelineItem title="งานเสร็จสิ้น" date={selectedTask.completed_at} isDone={!!selectedTask.completed_at} isLast color={COLORS.success} />
                    </View>

                    {/* ✅ NoteBox (อัปเดตล่าสุด) - ซ่อนเมื่อสถานะเป็น "มอบหมาย" */}
                    {selectedTask.status !== 'มอบหมาย' && (
                        <View style={styles.noteBox}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                <History size={14} color={COLORS.primary} />
                                <Text style={styles.noteTitle}>อัปเดตล่าสุด:</Text>
                            </View>
                            <Text style={styles.noteText}>{selectedTask.progress_note || 'ยังไม่มีข้อมูลอัปเดตเพิ่มเติม'}</Text>
                        </View>
                    )}
                </View>

                {/* 2.5 Work Result (แสดงเฉพาะสถานะสำเร็จ) */}
                {selectedTask.status === 'สำเร็จ' && (
                    <View style={styles.sectionContainer}>
                        <View style={styles.sectionHeader}>
                            <View style={[styles.sectionIcon, { backgroundColor: COLORS.successLight }]}>
                                <CheckCircle2 size={18} color={COLORS.success} />
                            </View>
                            <Text style={styles.sectionTitle}>ผลการดำเนินงาน (จบงาน)</Text>
                        </View>

                        <View style={[styles.detailCard, { borderColor: COLORS.successLight, backgroundColor: '#F0FDF4' }]}>
                            <Text style={[styles.descText, { color: COLORS.textPrimary }]}>
                                {selectedTask.submission_note || selectedTask.work_note || '- ไม่ได้ระบุรายละเอียดผลงาน -'}
                            </Text>
                        </View>

                        <View style={{ marginTop: 12 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                                <ImageIcon size={14} color={COLORS.success} />
                                <Text style={{ fontSize: 13, fontWeight: '600', color: COLORS.success }}>หลักฐานการส่งงาน (Proof of Work)</Text>
                            </View>
                            {completionImages.length > 0 ? (
                                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                                    {completionImages.map((file: any, i: number) => (
                                        <TouchableOpacity key={i} onPress={() => setFullImage(getImgUrl(file.file_path || file))}>
                                            {/* @ts-ignore */}
                                            <Image source={{ uri: getImgUrl(file.file_path || file) }} style={styles.attachImg} />
                                        </TouchableOpacity>
                                    ))}
                                </ScrollView>
                            ) : (
                                <Text style={{ fontSize: 14, color: COLORS.textSecondary, marginLeft: 20 }}>-</Text>
                            )}
                        </View>
                    </View>
                )}

                {/* 6. Action Buttons */}
                <View style={{ marginTop: 20, gap: 15 }}>

                    {/* --------------------------------------------------------- */}
                    {/* 1. ปุ่มกดรับงาน (Start Work) */}
                    {/* แสดงเมื่อ: สถานะ 'มอบหมาย' และ Role ต้องไม่ใช่ CEO (Admin/Staff กดได้) */}
                    {/* --------------------------------------------------------- */}
                    {selectedTask.status === 'มอบหมาย' && userRole?.toLowerCase() !== 'ceo' && (
                        <TouchableOpacity
                            style={styles.primaryBtn}
                            onPress={() => showConfirm('เริ่มงานทันที', 'เริ่มดำเนินการ?', 'info', 'เริ่มงาน', () => submitAction('start_work'))}
                        >
                            <Play size={20} color="#FFF" fill="#FFF" />
                            <Text style={styles.primaryBtnText}>กดรับงาน (Start Work)</Text>
                        </TouchableOpacity>
                    )}

                    {/* --------------------------------------------------------- */}
                    {/* 2. ฟอร์มอัปเดตงาน/ส่งงาน (Update & Submit) */}
                    {/* แสดงเมื่อ: สถานะ 'ดำเนินการ' และ Role ต้องไม่ใช่ CEO (Admin/Staff ทำได้) */}
                    {/* --------------------------------------------------------- */}
                    {selectedTask.status === 'ดำเนินการ' && userRole?.toLowerCase() !== 'ceo' && (
                        <>
                            {/* ส่วนอัปเดตความคืบหน้า */}
                            <View style={styles.actionCard}>
                                <Text style={styles.actionHeader}>💬 อัปเดตงานรายวัน</Text>
                                <View style={styles.inputRow}>
                                    <TextInput
                                        style={styles.modernInput}
                                        placeholder="พิมพ์ความคืบหน้า..."
                                        placeholderTextColor="#94A3B8"
                                        value={progressMsg}
                                        onChangeText={setProgressMsg}
                                    />
                                    <TouchableOpacity
                                        style={styles.sendBtn}
                                        onPress={() => {
                                            if (!progressMsg.trim()) { showAlert('แจ้งเตือน', 'ระบุข้อความ', 'warning'); return; }
                                            showConfirm('บันทึก', 'บันทึกความคืบหน้า?', 'info', 'บันทึก', () => submitAction('update_progress'));
                                        }}
                                    >
                                        <Send size={18} color="#FFF" />
                                    </TouchableOpacity>
                                </View>
                            </View>

                            {/* ส่วนส่งงาน (Submit) */}
                            <View style={[styles.actionCard, { borderColor: COLORS.success, borderWidth: 1, backgroundColor: '#F0FDF4' }]}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                                    <CheckCircle2 size={18} color={COLORS.success} />
                                    <Text style={[styles.actionHeader, { color: COLORS.success, marginBottom: 0 }]}>ส่งงาน / ปิดจ็อบ</Text>
                                </View>

                                <TextInput
                                    style={[styles.textArea, { backgroundColor: '#FFF' }]}
                                    placeholder="รายละเอียดการทำงาน..."
                                    multiline
                                    numberOfLines={3}
                                    value={workNote}
                                    onChangeText={setWorkNote}
                                />

                                <TouchableOpacity style={styles.uploadBtn} onPress={pickImage}>
                                    <Camera size={18} color={COLORS.textSecondary} />
                                    <Text style={{ fontSize: 13, color: COLORS.textSecondary }}>แนบรูป ({workImages.length})</Text>
                                </TouchableOpacity>

                                {/* Preview รูปภาพที่เลือก */}
                                {workImages.length > 0 && (
                                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 10 }}>
                                        {workImages.map((img, i) => (
                                            <View key={i} style={{ marginRight: 10 }}>
                                                <TouchableOpacity onPress={() => setFullImage(img.uri)}>
                                                    <Image source={{ uri: img.uri }} style={styles.previewImg} />
                                                </TouchableOpacity>
                                                <TouchableOpacity onPress={() => removeImage(i)} style={styles.removeImgBtn}>
                                                    <X size={10} color="#FFF" />
                                                </TouchableOpacity>
                                            </View>
                                        ))}
                                    </ScrollView>
                                )}

                                <TouchableOpacity
                                    style={styles.finishBtn}
                                    onPress={() => showConfirm('ยืนยัน', 'ตรวจสอบข้อมูลก่อนยืนยัน', 'success', 'ส่งงาน', () => submitAction('save_work'))}
                                >
                                    {actionLoading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.finishBtnText}>ยืนยันการส่งงาน</Text>}
                                </TouchableOpacity>
                            </View>
                        </>
                    )}

                    {/* --------------------------------------------------------- */}
                    {/* 3. ปุ่มลบงาน (Delete Task) */}
                    {/* ✅ แสดงเฉพาะ: Role เป็น 'admin' หรือ 'ceo' เท่านั้น */}
                    {/* --------------------------------------------------------- */}
                    {(userRole?.toLowerCase() === 'admin' || userRole?.toLowerCase() === 'ceo') && (
                        <TouchableOpacity style={styles.deleteBtn} onPress={handleDeleteTask}>
                            <Trash2 size={16} color={COLORS.danger} />
                            <Text style={styles.deleteBtnText}>ลบรายการงานนี้</Text>
                        </TouchableOpacity>
                    )}

                </View>
            </ScrollView>
        );
    
    };;

const renderTaskItem = ({ item }: { item: Task }) => {
    
    // --- ส่วนที่ 1: เตรียมข้อมูลสำหรับเช็คสิทธิ์ ---
    // ตัดเอาเฉพาะชื่อพนักงาน ไม่เอาชื่อสังกัดในวงเล็บมาเทียบ
    const cleanAssignedTo = item.assigned_to ? item.assigned_to.split('(')[0].trim() : '';
    
    // เช็คว่าคนที่ล็อกอินอยู่คือคนที่รับงานนี้ใช่ไหม
    const isAssignedToMe = cleanAssignedTo === userName;
    
    // เช็คว่าคนที่ล็อกอินอยู่คือบอส, แอดมิน, หรือคนสั่งงานนี้ใช่ไหม
    const isCreatorOrAdmin = userRole === 'admin' || userRole === 'ceo' || item.created_by === userName;

    // --- ส่วนที่ 2: ตั้งเงื่อนไขการโชว์ป้าย ---
    // เงื่อนไขพนักงาน: โชว์ NEW (สีส้ม) เฉพาะงานตัวเองที่เพิ่งสั่ง (สถานะ: มอบหมาย) และยังไม่เคยเปิดดู
    const isEmployeeUnread = isAssignedToMe && !readIds.includes(String(item.task_id)) && item.status === 'มอบหมาย';

    // เงื่อนไขบอส: โชว์ UPDATE (สีน้ำเงิน) เมื่อพนักงานอัปเดตงาน (API ส่งค่ามาบอกว่ายังไม่ได้อ่าน)
   const isBossUnread = isCreatorOrAdmin && item.is_read_admin == 0 && !isAssignedToMe;

    // กำหนดข้อความและสีของป้าย
    let badgeText = null;
    let badgeBgColor = '';

    if (isEmployeeUnread) {
        badgeText = 'NEW';
        badgeBgColor = '#F97316'; // สีส้ม
    } else if (isBossUnread && !isAssignedToMe) {
        badgeText = 'UPDATE';
        badgeBgColor = '#3B82F6'; // สีน้ำเงิน
    }

    // --- ส่วนที่ 3: วาดการ์ดแสดงผล ---
    return (
        <TouchableOpacity activeOpacity={0.8} style={styles.taskCard} onPress={() => openTaskModal(item)}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={{ flex: 1, paddingRight: 10 }}>
                    
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <Text style={styles.taskTitle} numberOfLines={1}>{item.title}</Text>
                        
                        {/* จุดที่โชว์ป้าย NEW หรือ UPDATE */}
                        {badgeText && (
                            <View style={{ backgroundColor: badgeBgColor, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                                <Text style={{ color: '#FFF', fontSize: 9, fontWeight: '800' }}>{badgeText}</Text>
                            </View>
                        )}
                    </View>

                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Briefcase size={12} color={COLORS.textSecondary} />
                        <Text style={styles.taskSub}>{item.company_display || 'ทั่วไป'}</Text>
                    </View>
                </View>
                <StatusPill status={item.status} />
            </View>
            <View style={styles.divider} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <View style={styles.avatar}><Text style={styles.avatarText}>{item.assigned_to?.charAt(0)}</Text></View>
                    <Text style={styles.assigneeText}>{item.assigned_to}</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Clock size={12} color={COLORS.textSecondary} />
                    <Text style={styles.dateText}>{moment(item.assign_date).format('D MMM')}</Text>
                </View>
            </View>
        </TouchableOpacity>
    );
};
    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="dark-content" backgroundColor="#F1F5F9" />

            {/* HEADER */}
            <View style={styles.headerContainer}>
                <View style={styles.headerContentRow}>
                    <View style={styles.headerIconContainer}>
                        <LayoutDashboard size={24} color="#FFF" />
                    </View>
                    <Text style={styles.headerTitleText}>ภาพรวมการสั่งการและติดตามงาน</Text>
                </View>
                <View style={styles.datePill}>
                    <CalendarDays size={14} color={COLORS.primary} />
                 <Text style={styles.filterValue} numberOfLines={1}>
    {filterDate ? moment(filterDate).format('DD MMM YYYY') : 'งานทั้งหมด'}
</Text>
                </View>
            </View>

            <View style={styles.greetingSection}>
                <Text style={styles.greetingText}>สวัสดี, {userName}</Text>
            </View>

            <View style={styles.statsContainer}>
                <StatCard label="ทั้งหมด" value={stats.total} icon={<FileText size={20} />} color={COLORS.textSecondary} active={filterStatus === ''} onPress={() => setFilterStatus('')} />
                <StatCard label="มอบหมาย" value={stats.ordered} icon={<Inbox size={20} />} color={COLORS.info} active={filterStatus === 'มอบหมาย'} onPress={() => setFilterStatus('มอบหมาย')} />
                <StatCard label="ดำเนินการ" value={stats.process} icon={<Loader2 size={20} />} color={COLORS.warning} active={filterStatus === 'ดำเนินการ'} onPress={() => setFilterStatus('ดำเนินการ')} />
                <StatCard label="สำเร็จ" value={stats.success} icon={<CheckCircle2 size={20} />} color={COLORS.success} active={filterStatus === 'สำเร็จ'} onPress={() => setFilterStatus('สำเร็จ')} />
            </View>

            <View style={styles.filterSection}>
                {/* ✅ เงื่อนไข: แสดงตัวเลือกบริษัทเฉพาะ CEO และ Admin */}
                {(userRole === 'admin' || userRole === 'ceo') ? (
                    <TouchableOpacity style={styles.dropdownSelector} activeOpacity={0.7} onPress={() => setShowCompanyModal(true)}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <View style={styles.iconCircle}><Building2 size={16} color={COLORS.primary} /></View>
                            <View><Text style={styles.filterLabel}>สังกัด / บริษัท</Text><Text style={styles.filterValue} numberOfLines={1}>{filterCompany?.company_name || 'ทั้งหมด'}</Text></View>
                        </View>
                        <ChevronDown size={20} color={COLORS.textSecondary} />
                    </TouchableOpacity>
                ) : (
                    // ถ้าไม่ใช่ Admin ให้แสดงเป็น Text ธรรมดา หรือซ่อนไปเลยก็ได้
                    <View style={[styles.dropdownSelector, { backgroundColor: '#F1F5F9', borderColor: 'transparent' }]}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <View style={[styles.iconCircle, { backgroundColor: '#E2E8F0' }]}><User size={16} color={COLORS.textSecondary} /></View>
                            <View><Text style={styles.filterLabel}>ผู้ใช้งาน</Text><Text style={styles.filterValue}>{userName}</Text></View>
                        </View>
                    </View>
                )}

                {/* ตัวเลือกวันที่ แสดงให้ทุกคนเห็นเหมือนเดิม */}
                <TouchableOpacity style={styles.dropdownSelector} activeOpacity={0.7} onPress={() => { 
    // ถ้า filterDate ว่าง ให้ใช้ moment() (วันนี้) เป็นตัวตั้งต้นปฏิทิน
    setDisplayMonth(filterDate ? moment(filterDate) : moment()); 
    setShowCalendarModal(true); 
}}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <View style={[styles.iconCircle, { backgroundColor: COLORS.warningLight }]}><CalendarDays size={16} color={COLORS.warning} /></View>
                        <View>
                            <Text style={styles.filterLabel}>วันที่ทำงาน</Text>
                            <Text style={styles.filterValue} numberOfLines={1}>{moment(filterDate).format('DD MMM YYYY')}</Text>
                        </View>
                    </View>
                    <ChevronDown size={20} color={COLORS.textSecondary} />
                </TouchableOpacity>
            </View>

            <View style={styles.listContainer}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
                    <Text style={styles.listHeader}>รายการงาน ({tasks.length})</Text>
                    <TouchableOpacity><Filter size={18} color={COLORS.textSecondary} /></TouchableOpacity>
                </View>
                {loading ? <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 20 }} /> :
                    <FlatList
                        data={tasks}
                        renderItem={renderTaskItem}
                        keyExtractor={(item) => item.task_id.toString()}
                        contentContainerStyle={{ paddingBottom: 40 }}
                        showsVerticalScrollIndicator={false}
                        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
                        ListEmptyComponent={<View style={styles.emptyBox}><Inbox size={40} color={COLORS.border} /><Text style={styles.emptyText}>ไม่มีข้อมูลงาน</Text></View>}
                    />}
            </View>

            {/* --- Modals --- */}
            <Modal animationType="slide" transparent={true} visible={modalVisible} onRequestClose={() => setModalVisible(false)}>
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
                    <View style={styles.modalContainer}>
                        <View style={styles.modalDragBar} />
                        <View style={styles.modalNav}>
                            <Text style={styles.modalNavTitle}>รายละเอียดงาน</Text>
                            <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.closeBtn}><X size={24} color={COLORS.textPrimary} /></TouchableOpacity>
                        </View>
                        <View style={{ flex: 1, backgroundColor: '#F8FAFC' }}>{renderModalContent()}</View>
                    </View>
                </KeyboardAvoidingView>
            </Modal>

            <Modal visible={showCompanyModal} transparent animationType="fade" onRequestClose={() => setShowCompanyModal(false)}>
                <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowCompanyModal(false)}>
                    <View style={styles.pickerModalContent}>
                        <Text style={styles.pickerTitle}>เลือกสังกัด / บริษัท</Text>
                        <ScrollView style={{ maxHeight: 300 }}>{companies.map((comp, i) => (<TouchableOpacity key={i} style={[styles.pickerItem, filterCompany?.id === comp.id && styles.pickerItemActive]} onPress={() => { setFilterCompany(comp); setShowCompanyModal(false); }}><Text style={[styles.pickerItemText, filterCompany?.id === comp.id && { color: COLORS.primary, fontWeight: '700' }]}>{comp.company_name}</Text>{filterCompany?.id === comp.id && <CheckCircle2 size={18} color={COLORS.primary} />}</TouchableOpacity>))}</ScrollView>
                    </View>
                </TouchableOpacity>
            </Modal>

            {renderCalendarModal()}

            <Modal visible={!!fullImage} transparent={true} onRequestClose={() => setFullImage(null)}>
                <View style={styles.fullImageContainer}>
                    <TouchableOpacity style={styles.fullImageCloseBtn} onPress={() => setFullImage(null)}><X size={30} color="#FFF" /></TouchableOpacity>
                    {fullImage && <Image source={{ uri: fullImage }} style={styles.fullImage} resizeMode="contain" />}
                </View>
            </Modal>

            <CustomConfirmModal visible={confirmVisible} config={confirmConfig} onCancel={() => setConfirmVisible(false)} onConfirm={handleConfirmAction} />
            <CustomAlertModal visible={alertVisible} config={alertConfig} onClose={() => setAlertVisible(false)} />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.background, paddingTop: Platform.OS === 'android' ? 30 : 0 },

    // Header
    headerContainer: {
        backgroundColor: '#FFF',
        marginHorizontal: 20,
        marginTop: Platform.OS === 'android' ? 10 : 0,
        marginBottom: 10,
        padding: 15,
        borderRadius: 16,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 10, elevation: 3
    },
    headerContentRow: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
    headerIconContainer: { width: 40, height: 40, borderRadius: 12, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center' },
    headerTitleText: { fontSize: 16, fontWeight: '800', color: COLORS.primary, flex: 1 },
    datePill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORS.background, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
    datePillText: { fontSize: 12, fontWeight: '600', color: COLORS.textPrimary },

    greetingSection: { paddingHorizontal: 25, marginBottom: 15 },
    greetingText: { fontSize: 14, color: COLORS.textSecondary },

    // Filter Styles
    filterSection: { paddingHorizontal: 20, marginBottom: 15, flexDirection: 'row', gap: 10 },
    dropdownSelector: { flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: COLORS.card, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: '#F1F5F9', shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 3, elevation: 2 },
    iconCircle: { width: 32, height: 32, borderRadius: 10, backgroundColor: COLORS.primaryLight, justifyContent: 'center', alignItems: 'center' },
    filterLabel: { fontSize: 9, color: COLORS.textSecondary },
    filterValue: { fontSize: 12, fontWeight: '700', color: COLORS.textPrimary, maxWidth: 90 },

    // Calendar
    calendarContainer: { backgroundColor: '#FFF', width: '90%', borderRadius: 20, padding: 20, alignSelf: 'center', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10, elevation: 5 },
    calendarHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    calendarTitle: { fontSize: 16, fontWeight: '700', color: COLORS.textPrimary },
    calendarYear: { fontSize: 16, fontWeight: '400', color: COLORS.textSecondary },
    weekRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
    weekText: { width: '13%', textAlign: 'center', fontSize: 12, fontWeight: '600', color: COLORS.textSecondary },
    daysGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-start' },
    dayCell: { width: '14.28%', height: 40, justifyContent: 'center', alignItems: 'center', marginBottom: 5 },
    dayCellSelected: { backgroundColor: COLORS.primary, borderRadius: 10 },
    dayCellToday: { borderWidth: 1, borderColor: COLORS.primary, borderRadius: 10 },
    dayText: { fontSize: 14, color: COLORS.textPrimary },

    // Picker
    pickerModalContent: { backgroundColor: '#FFF', width: '85%', borderRadius: 20, padding: 20, alignSelf: 'center' },
    pickerTitle: { fontSize: 16, fontWeight: '800', marginBottom: 15, textAlign: 'center', color: COLORS.textPrimary },
    pickerItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
    pickerItemActive: { backgroundColor: COLORS.primaryLight, paddingHorizontal: 10, borderRadius: 10, borderBottomWidth: 0 },
    pickerItemText: { fontSize: 14, color: COLORS.textPrimary },

    // Stats
    statsContainer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', paddingHorizontal: 20, gap: 12, marginBottom: 15 },
    statCard: { width: (SCREEN_WIDTH - 52) / 2, padding: 14, backgroundColor: COLORS.card, borderRadius: 16, flexDirection: 'row', alignItems: 'center', gap: 12, shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 4, elevation: 2, height: 70, borderWidth: 1, borderColor: 'transparent', marginBottom: 0 },
    statIconBox: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
    statLabel: { fontSize: 11, fontWeight: '600', color: COLORS.textSecondary },
    statValue: { fontSize: 20, fontWeight: '800', color: COLORS.textPrimary, marginTop: -2 },

    // List
    listContainer: { flex: 1, paddingHorizontal: 20 },
    listHeader: { fontSize: 16, fontWeight: '700', color: COLORS.primary },
    taskCard: { backgroundColor: COLORS.card, borderRadius: 16, padding: 16, marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 2, borderWidth: 1, borderColor: '#F1F5F9' },
    taskTitle: { fontSize: 16, fontWeight: '700', color: COLORS.textPrimary },
    taskSub: { fontSize: 12, color: COLORS.textSecondary },
    divider: { height: 1, backgroundColor: COLORS.border, marginVertical: 12 },
    avatar: { width: 24, height: 24, borderRadius: 12, backgroundColor: COLORS.primaryLight, justifyContent: 'center', alignItems: 'center' },
    avatarText: { fontSize: 10, fontWeight: '700', color: COLORS.primary },
    assigneeText: { fontSize: 12, fontWeight: '600', color: COLORS.textPrimary },
    dateText: { fontSize: 11, color: COLORS.textSecondary },
    emptyBox: { alignItems: 'center', justifyContent: 'center', marginTop: 50, gap: 10 },
    emptyText: { color: COLORS.textSecondary },

    // Modal
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center' },
    modalContainer: { backgroundColor: '#F8FAFC', borderTopLeftRadius: 24, borderTopRightRadius: 24, height: '94%', overflow: 'hidden', width: '100%', position: 'absolute', bottom: 0 },
    modalDragBar: { width: 40, height: 5, backgroundColor: '#CBD5E1', borderRadius: 3, alignSelf: 'center', marginTop: 10 },
    modalNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 15 },
    modalNavTitle: { fontSize: 14, fontWeight: '600', color: COLORS.textSecondary, textTransform: 'uppercase', letterSpacing: 1 },
    closeBtn: { padding: 4, backgroundColor: '#E2E8F0', borderRadius: 20 },

    // ✅ New Modal Detail Styles
    modalTaskTitle: { fontSize: 20, fontWeight: '800', color: COLORS.textPrimary, lineHeight: 28 },
    modalCompanyText: { fontSize: 14, color: COLORS.textSecondary, fontWeight: '500' },

    sectionContainer: { marginBottom: 20 },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
    sectionIcon: { width: 32, height: 32, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
    sectionTitle: { fontSize: 16, fontWeight: '700', color: COLORS.textPrimary },

    rowGrid: { flexDirection: 'row', gap: 12 },
    infoCard: { flex: 1, backgroundColor: '#FFF', padding: 15, borderRadius: 16, borderWidth: 1, borderColor: '#F1F5F9' },
    infoLabel: { fontSize: 11, color: COLORS.textSecondary, marginBottom: 2 },
    infoValue: { fontSize: 13, fontWeight: '700', color: COLORS.textPrimary },
    miniAvatar: { width: 24, height: 24, borderRadius: 12, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center' },

    detailCard: { backgroundColor: '#FFF', padding: 20, borderRadius: 16, borderWidth: 1, borderColor: '#F1F5F9' },
    descText: { fontSize: 14, color: COLORS.textPrimary, lineHeight: 22 },

    attachImg: { width: 70, height: 70, borderRadius: 12, marginRight: 10, backgroundColor: COLORS.background },

    noteBox: { backgroundColor: '#FFF', padding: 16, borderRadius: 16, marginTop: 15, borderWidth: 1, borderColor: '#E2E8F0' },
    noteTitle: { fontSize: 12, fontWeight: '700', color: COLORS.primary },
    noteText: { fontSize: 13, color: COLORS.textPrimary, lineHeight: 20 },

    // Action Cards (Existing)
    actionCard: { backgroundColor: '#FFF', padding: 15, borderRadius: 16, marginBottom: 15, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 2 },
    actionHeader: { fontSize: 14, fontWeight: '700', color: COLORS.textPrimary, marginBottom: 10 },
    inputRow: { flexDirection: 'row', gap: 8 },
    modernInput: { flex: 1, backgroundColor: COLORS.inputBg, borderRadius: 12, paddingHorizontal: 15, height: 46, fontSize: 14, color: COLORS.textPrimary },
    textArea: { backgroundColor: COLORS.inputBg, borderRadius: 12, padding: 15, fontSize: 14, textAlignVertical: 'top', minHeight: 80, color: COLORS.textPrimary, borderWidth: 1, borderColor: COLORS.border },

    sendBtn: { width: 46, height: 46, backgroundColor: COLORS.primary, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    uploadBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 12, backgroundColor: '#FFF', borderRadius: 12, marginTop: 10, gap: 8, borderStyle: 'dashed', borderWidth: 1, borderColor: COLORS.textSecondary },
    finishBtn: { backgroundColor: COLORS.success, paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginTop: 15, shadowColor: COLORS.success, shadowOpacity: 0.3, shadowRadius: 5 },
    finishBtnText: { color: '#FFF', fontWeight: '700', fontSize: 16 },
    primaryBtn: { flexDirection: 'row', backgroundColor: COLORS.primary, paddingVertical: 15, borderRadius: 16, justifyContent: 'center', alignItems: 'center', gap: 8, shadowColor: COLORS.primary, shadowOpacity: 0.3, shadowRadius: 5 },
    primaryBtnText: { color: '#FFF', fontWeight: '700', fontSize: 16 },
    deleteBtn: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', padding: 15, gap: 8, opacity: 0.8 },
    deleteBtnText: { color: COLORS.danger, fontWeight: '700', fontSize: 14 },

    previewImg: { width: 60, height: 60, borderRadius: 8, backgroundColor: '#EEE' },
    removeImgBtn: { position: 'absolute', right: -6, top: -6, backgroundColor: COLORS.danger, width: 20, height: 20, borderRadius: 10, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#FFF' },

    fullImageContainer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center', alignItems: 'center' },
    fullImage: { width: '100%', height: '80%' },
    fullImageCloseBtn: { position: 'absolute', top: 50, right: 20, padding: 10, zIndex: 99 },

    // Confirm Overlay
    confirmOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 },
    confirmContainer: { backgroundColor: '#FFF', width: '85%', borderRadius: 24, padding: 24, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 10, elevation: 5 },
    confirmIconBox: { width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
    confirmTitle: { fontSize: 18, fontWeight: '800', color: COLORS.textPrimary, marginBottom: 8, textAlign: 'center' },
    confirmMessage: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', marginBottom: 24, lineHeight: 20 },
    confirmBtnRow: { flexDirection: 'row', gap: 12, width: '100%' },
    btnCancel: { flex: 1, paddingVertical: 12, backgroundColor: '#F1F5F9', borderRadius: 12, alignItems: 'center' },
    btnCancelText: { fontSize: 14, fontWeight: '700', color: COLORS.textSecondary },
    btnConfirm: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
    btnConfirmText: { fontSize: 14, fontWeight: '700', color: '#FFF' }
});