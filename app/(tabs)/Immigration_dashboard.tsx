import { useAuth } from "../_layout";
import { DeviceEventEmitter, ActivityIndicator, Dimensions, Image, Modal, Platform, RefreshControl, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, TouchableWithoutFeedback, useColorScheme, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useFocusEffect } from '@react-navigation/native';
import axios from 'axios';
import { BlurView } from 'expo-blur';
import * as ImagePicker from 'expo-image-picker';
import {
    AlertTriangle, Building2, Calendar, CalendarClock, CalendarDays, Check, CheckCircle2, ChevronDown, Clock, FilePlus, HardHat, HelpCircle, History, ImageOff, Layers, LayoutGrid, Loader2, Lock, MapPin, Play, PlayCircle, Trash2, UploadCloud, User, UserCheck, Wallet, X, ArrowRight, RotateCcw,
} from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE, IMG_BASE_URL } from '../../constants/config';

const SCREEN_WIDTH = Dimensions.get('window').width;

// --- [THEME CONFIGURATION - PREMIUM WEB MATCH] ---
const Colors = {
    light: {
        background: '#F8FAFC', 
        card: 'rgba(255, 255, 255, 0.85)', // Glassmorphism
        cardSolid: '#FFFFFF',
        text: '#0F172A',
        textSecondary: '#64748B',
        border: 'rgba(255, 255, 255, 0.5)',
        borderSolid: '#E2E8F0',
        inputBg: 'rgba(248, 250, 252, 0.8)',
        modalOverlay: 'rgba(15, 23, 42, 0.4)',
        divider: '#F1F5F9',
        subBlockBg: '#F8FAFC',
        primarySoft: '#EFF6FF',
    },
    dark: {
        background: '#0B1120',
        card: 'rgba(30, 41, 59, 0.85)', // Glassmorphism
        cardSolid: '#1E293B',
        text: '#F8FAFC',
        textSecondary: '#94A3B8',
        border: 'rgba(255, 255, 255, 0.05)',
        borderSolid: '#334155',
        inputBg: 'rgba(15, 23, 42, 0.5)',
        modalOverlay: 'rgba(0, 0, 0, 0.6)',
        divider: '#334155',
        subBlockBg: 'rgba(15, 23, 42, 0.4)',
        primarySoft: '#172554',
    }
};

// --- [CUSTOM COMPONENT] Beautiful Alert ---
interface BeautifulAlertProps {
    visible: boolean; type: 'question' | 'success' | 'warning' | 'error' | 'delete'; title: string; message?: string; children?: React.ReactNode; confirmText?: string; cancelText?: string; showCancel?: boolean; onConfirm?: () => void; onCancel?: () => void; isDark: boolean;
}

const BeautifulAlert = ({ visible, type, title, message, children, confirmText = 'ตกลง', cancelText = 'ยกเลิก', showCancel = true, onConfirm, onCancel, isDark }: BeautifulAlertProps) => {
    if (!visible) return null;
    const theme = isDark ? Colors.dark : Colors.light;
    const getConfig = () => {
        switch (type) {
            case 'question': return { icon: <HelpCircle size={40} color="#3B82F6" />, bgIcon: isDark ? '#172554' : '#EFF6FF', confirmColor: '#3B82F6' };
            case 'success': return { icon: <CheckCircle2 size={40} color="#10B981" />, bgIcon: isDark ? '#064E3B' : '#ECFDF5', confirmColor: '#10B981' };
            case 'warning': return { icon: <AlertTriangle size={40} color="#F59E0B" />, bgIcon: isDark ? '#451a03' : '#FFFBEB', confirmColor: '#F59E0B' };
            case 'delete': return { icon: <Trash2 size={40} color="#EF4444" />, bgIcon: isDark ? '#450a0a' : '#FEF2F2', confirmColor: '#EF4444' };
            case 'error': default: return { icon: <X size={40} color="#EF4444" />, bgIcon: isDark ? '#450a0a' : '#FEF2F2', confirmColor: '#EF4444' };
        }
    };
    const config = getConfig();

    return (
        <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
            <View style={[alertStyles.overlay, { backgroundColor: theme.modalOverlay }]}>
                <BlurView intensity={isDark ? 40 : 20} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFill} />
                <View style={[alertStyles.container, { backgroundColor: theme.cardSolid }]}>
                    <View style={[alertStyles.iconCircle, { backgroundColor: config.bgIcon }]}>
                        {config.icon}
                    </View>
                    <Text style={[alertStyles.title, { color: theme.text }]}>{title}</Text>
                    {message ? <Text style={[alertStyles.message, { color: theme.textSecondary }]}>{message}</Text> : null}
                    {children && <View style={alertStyles.contentContainer}>{children}</View>}
                    <View style={alertStyles.buttonRow}>
                        {showCancel && onCancel && (
                            <TouchableOpacity style={[alertStyles.cancelButton, { backgroundColor: isDark ? '#334155' : '#F1F5F9' }]} onPress={onCancel}>
                                <Text style={[alertStyles.cancelText, { color: theme.textSecondary }]}>{cancelText}</Text>
                            </TouchableOpacity>
                        )}
                        <TouchableOpacity style={[alertStyles.confirmButton, { backgroundColor: config.confirmColor }]} onPress={onConfirm}>
                            <Text style={alertStyles.confirmText}>{confirmText}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
};

const alertStyles = StyleSheet.create({
    overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
    container: { width: '100%', maxWidth: 340, borderRadius: 32, padding: 32, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.25, shadowRadius: 20, elevation: 10 },
    iconCircle: { width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
    title: { fontSize: 22, fontWeight: '800', textAlign: 'center', marginBottom: 8 },
    message: { fontSize: 15, textAlign: 'center', marginBottom: 24, lineHeight: 22 },
    contentContainer: { width: '100%', marginBottom: 24 },
    buttonRow: { flexDirection: 'row', gap: 12, width: '100%' },
    cancelButton: { flex: 1, paddingVertical: 16, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
    cancelText: { fontSize: 16, fontWeight: '700' },
    confirmButton: { flex: 1.5, paddingVertical: 16, borderRadius: 16, alignItems: 'center', justifyContent: 'center', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 4 },
    confirmText: { fontSize: 16, fontWeight: '800', color: 'white' },
});

// --- Types & Constants ---
interface HistoryLog { old_date: string; new_date: string; reason: string; requested_by?: string; moved_at?: string; }
interface Report { id: string; assigner_name: string; company: string; work_date: string; requested_due_date?: string; location: string; activity: string; details: string; status: 'pending' | 'processing' | 'approved' | 'cancelled' | 'postponed'; extension_status?: 'pending' | 'approved' | 'rejected'; extension_reason?: string; cost: string; final_cost: string | null; created_at: string; started_at: string | null; completed_at: string | null; image_path: string; completion_image: string; completed_by?: string | null; completed_by_name?: string | null; accepted_by?: string | null; accepted_by_name?: string | null; history_log?: HistoryLog[]; assigned_time?: string; started_time?: string; completed_time?: string; }

const getCompanyTheme = (companyName: string, isDark: boolean) => {
    // อ้างอิงสีจากหน้าเว็บเป๊ะๆ
    const baseConfig: any = {
        'TJC CORPORATION': { color: '#F59E0B', iconColor: '#CA8A04', logo: `${IMG_BASE_URL}/logosdeer/logo_1766477513_380.png` }, // Amber
        'TANGJAI CORPORATION': { color: '#10B981', iconColor: '#059669', logo: `${IMG_BASE_URL}/logosdeer/logo_1766477549_239.png` }, // Emerald
        'ASCENT CORPORATION': { color: '#3B82F6', iconColor: '#2563EB', logo: `${IMG_BASE_URL}/logosdeer/logo_1766477538_294.png` }, // Blue
        'A.R.T EXPONENTIAL': { color: '#64748B', iconColor: '#475569', logo: `${IMG_BASE_URL}/logosdeer/logo_1766477525_718.png` }, // Slate
    };
    const config = baseConfig[companyName] || baseConfig['TJC CORPORATION'];
    return {
        ...config,
        logo: { uri: config.logo },
        bgColor: isDark ? '#1E293B' : config.color + '15', // Low opacity background
        borderColor: isDark ? '#334155' : '#E2E8F0',
        activeBorder: config.color,
        textColor: isDark ? '#F8FAFC' : '#0F172A'
    };
};

const COMPANY_KEYS = ['TJC CORPORATION', 'TANGJAI CORPORATION', 'ASCENT CORPORATION', 'A.R.T EXPONENTIAL'];

export default function DashboardScreen() {
    const { user } = useAuth();
    const colorScheme = useColorScheme();
    const isDark = colorScheme === 'dark';
    const theme = isDark ? Colors.dark : Colors.light;
    const styles = useMemo(() => getStyles(isDark), [isDark]);

    const [reports, setReports] = useState<Report[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const [filterCompany, setFilterCompany] = useState<string>('all');
    const [filterStatus, setFilterStatus] = useState<string>('all');
    const [showCompanyModal, setShowCompanyModal] = useState(false);
    const [filterDate, setFilterDate] = useState<Date | null>(null);
    const [showDatePicker, setShowDatePicker] = useState(false);

    const [showBacklog, setShowBacklog] = useState(false);
    const [showUnfinished, setShowUnfinished] = useState(false);

    const [selectedReport, setSelectedReport] = useState<Report | null>(null);
    const [modalVisible, setModalVisible] = useState(false);
    const [completionFiles, setCompletionFiles] = useState<ImagePicker.ImagePickerAsset[]>([]);
    const [inputFinalCost, setInputFinalCost] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const [showExtensionModal, setShowExtensionModal] = useState(false);
    const [extensionDate, setExtensionDate] = useState<Date>(new Date());
    const [extensionReason, setExtensionReason] = useState('');
    const [showExtDatePicker, setShowExtDatePicker] = useState(false);

    const [myRealName, setMyRealName] = useState('');
    const [myUserId, setMyUserId] = useState<string>('');

    useFocusEffect(
        useCallback(() => {
            const fetchUserFromDB = async () => {
                try {
                    const rawData = await AsyncStorage.getItem('user');
                    if (rawData) {
                        const localData = JSON.parse(rawData);
                        const userId = localData.id;
                        if (userId) {
                            setMyUserId(userId);
                            try {
                                const res = await axios.get(`${API_BASE}/api_mobile.php?action=get_user_info&id=${userId}&t=${Date.now()}`);
                                if (res.data && res.data.success) {
                                    setMyRealName(res.data.data.fullname || res.data.data.name || 'Unknown');
                                } else {
                                    setMyRealName(localData.fullname || localData.name || 'App User');
                                }
                            } catch {
                                setMyRealName(localData.fullname || 'App User');
                            }
                        }
                    }
                } catch (e) { console.error(e); }
            };
            fetchUserFromDB();
        }, [])
    );

    const [showImageModal, setShowImageModal] = useState(false);
    const [activeImageUrl, setActiveImageUrl] = useState<string | null>(null);
    const [alertConfig, setAlertConfig] = useState({ visible: false, type: 'question' as any, title: '', message: '', children: null as React.ReactNode, confirmText: 'ตกลง', cancelText: 'ยกเลิก', showCancel: true, onConfirm: () => { }, });

    const showAlert = (config: any) => setAlertConfig({ ...alertConfig, visible: true, ...config });
    const closeAlert = () => setAlertConfig(prev => ({ ...prev, visible: false }));
    const openImageModal = (url: string) => { setActiveImageUrl(url); setShowImageModal(true); };

    const fetchData = async () => {
        try {
            const response = await axios.get(`${API_BASE}/api_tasks.php?action=get_all_reports`);
            if (Array.isArray(response.data.data)) setReports(response.data.data);
            else if (Array.isArray(response.data)) setReports(response.data);
            else if (response.data?.data) setReports(response.data.data);
            else setReports([]);
        } catch (error) {
            console.error("Fetch Error:", error);
            setReports([]);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => { fetchData(); }, []);
    const onRefresh = useCallback(() => { setRefreshing(true); fetchData(); }, []);

    const isSameDay = (d1: Date, d2: Date) => d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();
    const formatDate = (dateStr: string) => { if (!dateStr) return '-'; const d = new Date(dateStr); const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']; return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear() + 543}`; };

    const { filteredData, stats, companyCosts, backlogCount, unfinishedCount } = useMemo(() => {
        const safeReports = Array.isArray(reports) ? reports : [];
        const today = new Date();
        today.setHours(0, 0, 0, 0); 
        const targetDate = filterDate || today;

        const backlogTotal = safeReports.filter(r => {
            const workD = new Date(r.work_date);
            workD.setHours(0, 0, 0, 0);
            return workD.getTime() < today.getTime() && (r.status === 'pending');
        }).length;

        const unfinishedTotal = safeReports.filter(r => {
            const workD = new Date(r.work_date);
            workD.setHours(0, 0, 0, 0);
            return workD.getTime() < today.getTime() && (r.status === 'processing');
        }).length;

        const filtered = safeReports.filter(r => {
            const workD = new Date(r.work_date);
            workD.setHours(0, 0, 0, 0);

            if (showBacklog) return workD.getTime() < today.getTime() && (r.status === 'pending');
            if (showUnfinished) return workD.getTime() < today.getTime() && (r.status === 'processing');

            const reqD = r.requested_due_date ? new Date(r.requested_due_date) : null;
            if (reqD) reqD.setHours(0, 0, 0, 0);

            const matchWorkDate = isSameDay(workD, targetDate);
            const matchPostponeDate = (r.status === 'postponed' && reqD && isSameDay(reqD, targetDate));

            if (!matchWorkDate && !matchPostponeDate) return false;

            const matchCompany = filterCompany === 'all' || r.company === filterCompany;
            const matchStatus = filterStatus === 'all' || r.status === filterStatus;

            if (filterStatus !== 'all' && filterStatus !== 'cancelled' && r.status === 'cancelled') return false;

            return matchCompany && matchStatus;
        });

        const currentTotalExpense = filtered.reduce((sum, r) => sum + (parseFloat(r.final_cost || '0') || 0), 0);

        const statObj = {
            total: filtered.length,
            pending: filtered.filter(r => r.status === 'pending').length,
            processing: filtered.filter(r => r.status === 'processing').length,
            postponed: filtered.filter(r => r.status === 'postponed').length,
            approved: filtered.filter(r => r.status === 'approved').length,
            totalExpense: currentTotalExpense
        };

        const costsObj: Record<string, number> = {};
        COMPANY_KEYS.forEach(key => costsObj[key] = 0);
        filtered.forEach(r => {
            const cost = parseFloat(r.final_cost || '0') || 0;
            const compKey = COMPANY_KEYS.find(k => r.company.includes(k.split(' ')[0]));
            if (compKey) costsObj[compKey] += cost;
        });

        return { filteredData: filtered, stats: statObj, companyCosts: costsObj, backlogCount: backlogTotal, unfinishedCount: unfinishedTotal };
    }, [reports, filterCompany, filterStatus, filterDate, showBacklog, showUnfinished]);

    const onChangeDate = (event: any, selectedDate?: Date) => {
        if (Platform.OS === 'android') setShowDatePicker(false);
        if (selectedDate) setFilterDate(selectedDate);
    };

    const closeModal = () => { setModalVisible(false); setSelectedReport(null); };

    const pickImages = async () => {
        const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsMultipleSelection: true, quality: 0.7 });
        if (!result.canceled) setCompletionFiles(prev => [...prev, ...result.assets]);
    };

    const removeImage = (index: number) => setCompletionFiles(prev => prev.filter((_, i) => i !== index));

    const handleUpdateStatus = async (status: string, extraData: any = {}) => {
        if (!selectedReport) return;
        setIsSubmitting(true);
        try {
            const formData = new FormData();
            formData.append('id', selectedReport.id);

            if (extraData.action) {
                formData.append('action', extraData.action);
                if (extraData.action === 'request_extension') {
                    formData.append('new_work_date', extraData.new_work_date);
                    formData.append('reason', extraData.reason);
                    formData.append('requested_by', extraData.requested_by);
                }
            } else {
                formData.append('status', status);
                if (extraData.new_work_date) formData.append('new_work_date', extraData.new_work_date);
            }

            if (status === 'processing') {
                formData.append('completed_by', myRealName);
                formData.append('accepted_by', myRealName);
            }

            if (status === 'approved') {
                formData.append('final_cost', inputFinalCost || '0');
                formData.append('completed_by', myRealName);
                completionFiles.forEach((file, index) => {
                    const uriParts = file.uri.split('.');
                    const fileType = uriParts[uriParts.length - 1];
                    // @ts-ignore
                    formData.append('completion_image[]', { uri: file.uri, name: `comp_${index}.${fileType}`, type: `image/${fileType}` });
                });
            }

            const res = await axios.post(`${API_BASE}/api_tasks.php?action=update_immigration_status`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });

            if (res.data.success) {
                if (status === 'processing') {
                    setSelectedReport(prev => prev ? { ...prev, status: 'processing', accepted_by_name: myRealName } : null);
                } else if (status === 'approved') {
                    setSelectedReport(prev => prev ? { ...prev, status: 'approved', completed_by_name: myRealName } : null);
                }

                closeModal();
                setShowExtensionModal(false);
                let title = 'สำเร็จ', msg = 'บันทึกข้อมูลเรียบร้อยแล้ว';
                if (status === 'processing') title = 'เริ่มงานแล้ว!';
                if (status === 'approved') title = 'ส่งงานเรียบร้อย!';
                if (extraData.action === 'request_extension') { title = 'แจ้งเลื่อนสำเร็จ'; msg = 'รอการอนุมัติหรือตรวจสอบ'; }
                if (extraData.action === 'cancel_extension_request') { title = 'ยกเลิกคำขอแล้ว'; msg = 'สถานะกลับเป็นปกติ'; }

                setTimeout(() => showAlert({ type: 'success', title: title, message: msg, confirmText: 'ตกลง', showCancel: false, onConfirm: () => { closeAlert(); fetchData(); } }), 300);
            } else {
                showAlert({ type: 'error', title: 'เกิดข้อผิดพลาด!', message: res.data.message || 'ไม่สามารถบันทึกข้อมูลได้', confirmText: 'ลองใหม่อีกครั้ง', showCancel: false, onConfirm: closeAlert });
            }
        } catch (error) {
            console.error(error);
            showAlert({ type: 'error', title: 'การเชื่อมต่อล้มเหลว', message: 'กรุณาตรวจสอบอินเทอร์เน็ต', confirmText: 'ตกลง', showCancel: false, onConfirm: closeAlert });
        } finally { setIsSubmitting(false); }
    };

    const confirmAcceptJob = () => showAlert({ type: 'question', title: 'ยืนยันการรับงาน?', message: "สถานะจะเปลี่ยนเป็น 'กำลังดำเนินการ'", confirmText: 'รับงานทันที', showCancel: true, onConfirm: () => { closeAlert(); setTimeout(() => handleUpdateStatus('processing'), 200); } });
    const confirmAcceptPostponed = () => {
        const newDate = selectedReport?.requested_due_date;
        showAlert({ type: 'question', title: 'ยืนยันเริ่มงาน?', message: newDate ? `งานจะเริ่มในวันที่ ${formatDate(newDate)}` : "ยืนยันการเริ่มงานตามวันนัดหมายใหม่", confirmText: 'ยืนยันเริ่มงาน', showCancel: true, onConfirm: () => { closeAlert(); setTimeout(() => handleUpdateStatus('processing', { new_work_date: newDate }), 200); } });
    };
    const confirmFinishJob = () => {
        if (completionFiles.length === 0) { showAlert({ type: 'warning', title: 'ยังไม่ได้แนบรูป?', message: 'กรุณาอัปโหลดรูปจบงานหรือสลิปก่อน', confirmText: 'ตกลง', showCancel: false, onConfirm: closeAlert }); return; }
        showAlert({
            type: 'success', title: 'ยืนยันการจบงาน?', children: (<View style={{ alignItems: 'center' }}><Text style={{ fontSize: 13, color: theme.textSecondary, marginBottom: 8 }}>ตรวจสอบข้อมูลให้ถูกต้องก่อนบันทึก</Text><View style={{ backgroundColor: isDark ? '#064E3B' : '#ECFDF5', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 16, borderWidth: 1, borderColor: '#10B981' }}><Text style={{ color: '#10B981', fontWeight: '800', fontSize: 18 }}>ยอดจ่ายจริง: {Number(inputFinalCost || '0').toLocaleString()} บาท</Text></View></View>), confirmText: 'ยืนยันจบงาน', showCancel: true, onConfirm: () => { closeAlert(); setTimeout(() => handleUpdateStatus('approved'), 200); }
        });
    };
    const confirmCancelJob = () => showAlert({ type: 'delete', title: 'ต้องการยกเลิกรายการนี้?', message: 'ต้องการยกเลิกงานนี้หรือไม่', confirmText: 'ใช่, ลบทันที', showCancel: true, onConfirm: () => { closeAlert(); setTimeout(() => handleUpdateStatus('cancelled', { action: 'delete_report' }), 200); } });

    const openExtensionModal = () => { setExtensionDate(new Date()); setExtensionReason(''); setShowExtensionModal(true); };
    const submitExtension = () => {
        if (!extensionReason.trim()) { alert('กรุณาระบุเหตุผล'); return; }
        const dateStr = extensionDate.toISOString().split('T')[0];
        handleUpdateStatus('pending', { action: 'request_extension', new_work_date: dateStr, reason: extensionReason, requested_by: myRealName });
    };
    const cancelExtensionRequest = () => {
        showAlert({ type: 'warning', title: 'ยืนยันยกเลิกการเลื่อน?', message: 'สถานะงานจะกลับมาเป็นปกติ', confirmText: 'ใช่, ยกเลิกเดี๋ยวนี้', cancelText: 'ไม่, เก็บไว้ก่อน', showCancel: true, onConfirm: () => { closeAlert(); setTimeout(() => handleUpdateStatus('pending', { action: 'cancel_extension_request' }), 200); } });
    };

    const getImages = (imgStr: string | null, type: 'assign' | 'completion') => {
        if (!imgStr) return [];
        const rawImages = imgStr.includes(',') ? imgStr.split(',').map(s => s.trim()).filter(s => s !== '') : [imgStr.trim()];
        return rawImages.map(img => {
            if (img.startsWith('http')) return img;
            let cleanFileName = img.replace('uploads/', '').replace('assign_img/', '').replace('complete_img/', '');
            const folder = type === 'assign' ? 'assign_img' : 'complete_img';
            return `${IMG_BASE_URL}/${folder}/${cleanFileName}`;
        });
    };

    const markAsRead = async (reportId: string) => {
        const currentUserId = user?.id; 
        if (!currentUserId) return;
        try {
            const idAsString = String(reportId).trim();
            const storageKey = `READ_IMMIGRATION_IDS_${currentUserId}`;
            const readData = await AsyncStorage.getItem(storageKey);
            let readIds: string[] = [];
            if (readData) { try { const parsed = JSON.parse(readData); readIds = Array.isArray(parsed) ? parsed.map(id => String(id).trim()) : []; } catch (e) { readIds = []; } }
            if (!readIds.includes(idAsString)) {
                const updatedReadIds = [...readIds, idAsString];
                await AsyncStorage.setItem(storageKey, JSON.stringify(updatedReadIds));
                DeviceEventEmitter.emit('updateImmigrationBadge');
            }
        } catch (e) { console.error("Failed to save read state", e); }
    };

    const openModal = (report: Report) => {
        markAsRead(report.id);
        setSelectedReport(report);
        setCompletionFiles([]);
        setInputFinalCost(report.final_cost && report.final_cost !== '0.00' ? report.final_cost : '');
        setModalVisible(true);
    };

    return (
        <View style={styles.container}>
            <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor="transparent" translucent />
            
            {/* Ambient Background Blobs (Premium Glass Effect) */}
            <View style={StyleSheet.absoluteFillObject}>
                <View style={[styles.ambientBlob, { top: -100, left: -50, backgroundColor: 'rgba(59, 130, 246, 0.15)' }]} />
                <View style={[styles.ambientBlob, { top: 200, right: -100, backgroundColor: 'rgba(168, 85, 247, 0.12)' }]} />
            </View>

            <SafeAreaView style={{ flex: 1 }}>
                <ScrollView contentContainerStyle={styles.scrollContent} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.text} />}>
                    
                    {/* --- GRAND HEADER (Web Match) --- */}
                    <View style={styles.grandHeader}>
                        <View style={styles.headerTopRow}>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.headerTitle}>ภาพรวมการทำงาน</Text>
                                <View style={styles.headerSubtitleBox}>
                                    <Calendar size={14} color="#3B82F6" />
                                    <Text style={styles.headerSubtitleText}>ข้อมูลประจำวันที่: {formatDate((filterDate ? filterDate : new Date()).toISOString())}</Text>
                                </View>
                            </View>
                        </View>
                    </View>

                    <View style={styles.sectionContainer}>
                        {/* 🔥 Part 3: UI Backlog & Unfinished Alert */}
                        <View style={{ paddingHorizontal: 24, marginBottom: 24 }}>
                            {backlogCount > 0 && !showBacklog && !showUnfinished && (
                                <TouchableOpacity style={styles.grandAlertBoxRed} onPress={() => { setShowBacklog(true); setShowUnfinished(false); setFilterCompany('all'); setFilterStatus('all'); }} activeOpacity={0.9}>
                                    <View style={styles.alertIconWrapperRed}>
                                        <AlertTriangle size={26} color="#EF4444" />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.grandAlertTitleRed}>งานตกค้าง {backlogCount} รายการ!</Text>
                                        <Text style={styles.grandAlertSubtitleRed}>งานจากวันที่ผ่านมา ที่ยังไม่ได้กดรับ</Text>
                                    </View>
                                    <View style={styles.grandAlertBtnRed}>
                                        <Text style={styles.grandAlertBtnTextRed}>ตรวจสอบ</Text>
                                        <ArrowRight size={16} color="#FFFFFF" strokeWidth={3} />
                                    </View>
                                </TouchableOpacity>
                            )}

                            {unfinishedCount > 0 && !showBacklog && !showUnfinished && (
                                <TouchableOpacity style={[styles.grandAlertBoxBlue, backlogCount > 0 && { marginTop: 16 }]} onPress={() => { setShowUnfinished(true); setShowBacklog(false); setFilterCompany('all'); setFilterStatus('all'); }} activeOpacity={0.9}>
                                    <View style={styles.alertIconWrapperBlue}>
                                        <Loader2 size={26} color="#3B82F6" />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.grandAlertTitleBlue}>งานค้างดำเนินการ {unfinishedCount} รายการ</Text>
                                        <Text style={styles.grandAlertSubtitleBlue}>มีงานค้างที่ยังไม่เสร็จสิ้น</Text>
                                    </View>
                                    <View style={styles.grandAlertBtnBlue}>
                                        <Text style={styles.grandAlertBtnTextBlue}>ดูรายการ</Text>
                                        <ArrowRight size={16} color="#FFFFFF" strokeWidth={3} />
                                    </View>
                                </TouchableOpacity>
                            )}

                            {(showBacklog || showUnfinished) && (
                                <View style={showBacklog ? styles.activeHeaderRed : styles.activeHeaderBlue}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
                                        <View style={showBacklog ? styles.activeIconBoxRed : styles.activeIconBoxBlue}>
                                            {showBacklog ? <History size={20} color="#EF4444" /> : <Loader2 size={20} color="#3B82F6" />}
                                        </View>
                                        <Text style={showBacklog ? styles.activeHeaderTextRed : styles.activeHeaderTextBlue}>
                                            {showBacklog ? 'รายการงานตกค้าง (ยังไม่รับงาน)' : 'รายการงานค้างดำเนินการ (ยังไม่จบงาน)'}
                                        </Text>
                                    </View>
                                    <TouchableOpacity style={styles.backlogBackBtn} onPress={() => { setShowBacklog(false); setShowUnfinished(false); }}>
                                        <RotateCcw size={16} color={theme.text} />
                                    </TouchableOpacity>
                                </View>
                            )}
                        </View>

                        {/* --- GRAND COMPANY GRID (Web Match) --- */}
                        <View style={styles.sectionHeader}>
                            <View style={styles.sectionHeaderIconWrap}>
                                <View style={styles.pulsingDot} />
                            </View>
                            <Text style={styles.sectionTitle}>สรุปค่าใช้จ่ายตามบริษัท</Text>
                        </View>
                        <View style={styles.companyGridContainer}>
                            {COMPANY_KEYS.map((name) => {
                                const cost = companyCosts[name] || 0;
                                const conf = getCompanyTheme(name, isDark);
                                const isActive = filterCompany === name;
                                return (
                                    <TouchableOpacity key={name} onPress={() => setFilterCompany(prev => prev === name ? 'all' : name)} activeOpacity={0.8}
                                        style={[
                                            styles.companyGridCard,
                                            { backgroundColor: isActive ? (isDark ? 'rgba(30, 41, 59, 0.9)' : '#FFFFFF') : theme.card, borderColor: isActive ? conf.activeBorder : theme.border, borderWidth: isActive ? 2 : 1 }
                                        ]}>
                                        
                                        <View style={[styles.gridLogoBox, { backgroundColor: conf.bgColor, borderColor: theme.border, borderWidth: 1 }]}>
                                            <Image source={conf.logo} style={styles.companyLogo} resizeMode="contain" />
                                        </View>
                                        <View style={{ alignItems: 'flex-start', marginTop: 'auto', width: '100%' }}>
                                            <Text style={[styles.gridCompanyName, { color: theme.textSecondary }]} numberOfLines={2}>{name}</Text>
                                            <Text style={[styles.gridCompanyCost, { color: theme.text }]}>
                                                {cost.toLocaleString()} <Text style={{fontSize: 14, color: theme.textSecondary}}>฿</Text>
                                            </Text>
                                        </View>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>

                        {/* --- GRAND STATS (Web Match) --- */}
                        <View style={styles.gridContainer}>
                            <StatCard label="งานทั้งหมด" value={stats.total} icon={Layers} color="#334155" bg={isDark ? '#1E293B' : '#F1F5F9'} border="#94A3B8" onPress={() => setFilterStatus('all')} active={filterStatus === 'all'} isDark={isDark} />
                            <StatCard label="มอบงาน" value={stats.pending} icon={Clock} color="#F97316" bg={isDark ? '#431407' : '#FFF7ED'} border="#F97316" onPress={() => setFilterStatus('pending')} active={filterStatus === 'pending'} isDark={isDark} />
                            <StatCard label="เลื่อนวัน" value={stats.postponed} icon={CalendarClock} color="#9333EA" bg={isDark ? '#3B0764' : '#F3E8FF'} border="#9333EA" onPress={() => setFilterStatus('postponed')} active={filterStatus === 'postponed'} isDark={isDark} />
                            <StatCard label="ดำเนินการ" value={stats.processing} icon={Loader2} color="#3B82F6" bg={isDark ? '#172554' : '#EFF6FF'} border="#3B82F6" onPress={() => setFilterStatus('processing')} active={filterStatus === 'processing'} isDark={isDark} />
                            <StatCard label="เสร็จสิ้น" value={stats.approved} icon={CheckCircle2} color="#10B981" bg={isDark ? '#064E3B' : '#ECFDF5'} border="#10B981" onPress={() => setFilterStatus('approved')} active={filterStatus === 'approved'} isDark={isDark} />
                            
                            {/* Total Expense Box (Web Match - Rose/Red) */}
                            <View style={styles.statCardFull}>
                                <View style={styles.flexRowBetween}>
                                    <View>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                                            <Wallet size={16} color="#F43F5E" />
                                            <Text style={styles.statLabelBig}>ยอดจ่ายจริงรวม (ทั้งหมด)</Text>
                                        </View>
                                        <Text style={styles.statValueGrand}>{stats.totalExpense.toLocaleString()} <Text style={{fontSize: 20, color: '#FB7185'}}>บาท</Text></Text>
                                    </View>
                                    <View style={styles.statIconLarge}><Wallet size={36} color="#FFFFFF" /></View>
                                </View>
                            </View>
                        </View>

                        {/* --- GRAND LIST --- */}
                        <View style={styles.listSection}>
                            <View style={styles.listHeaderGlass}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                                    <View style={styles.listHeaderIconWrap}><LayoutGrid size={24} color="#FFFFFF" /></View>
                                    <View>
                                        <Text style={styles.listHeaderTitle}>รายการงานประจำวัน</Text>
                                        <Text style={styles.listHeaderSubtitle}>พบทั้งหมด <Text style={{color: '#3B82F6', fontWeight: '800'}}>{filteredData.length}</Text> รายการ</Text>
                                    </View>
                                </View>
                            </View>

                            <View style={styles.filterRowBox}>
                                <TouchableOpacity style={styles.dropdownHeader} onPress={() => setShowCompanyModal(true)}>
                                    <Text style={styles.dropdownTitle}>{filterCompany === 'all' ? 'แสดงทุกบริษัท' : filterCompany.split(' ')[0]}</Text>
                                    <ChevronDown size={20} color={theme.textSecondary} />
                                </TouchableOpacity>

                                <TouchableOpacity style={[styles.dateButton, filterDate && styles.dateButtonActive]} onPress={() => setShowDatePicker(true)}>
                                    <CalendarDays size={18} color={filterDate ? '#FFFFFF' : theme.textSecondary} />
                                    <Text style={[styles.dateButtonText, filterDate && styles.dateButtonTextActive]}>{filterDate ? formatDate(filterDate.toISOString()) : 'วันที่...'}</Text>
                                </TouchableOpacity>
                                {filterDate && <TouchableOpacity style={styles.clearDateBtn} onPress={() => setFilterDate(null)}><RotateCcw size={18} color="#EF4444" /></TouchableOpacity>}
                            </View>
                            {showDatePicker && (<DateTimePicker value={filterDate || new Date()} mode="date" display={Platform.OS === 'ios' ? 'spinner' : 'default'} onChange={onChangeDate} />)}

                            {loading ? <View style={styles.loadingContainer}><ActivityIndicator size="large" color="#3B82F6" /><Text style={styles.loadingText}>กำลังโหลดข้อมูลแพลตฟอร์ม...</Text></View> : filteredData.length === 0 ? <View style={styles.emptyState}><View style={styles.emptyIconBox}><ImageOff size={40} color={theme.textSecondary} /></View><Text style={styles.emptyTitle}>ไม่พบรายการที่ตรงกัน</Text><Text style={styles.emptyText}>{filterDate ? `ลองเปลี่ยนตัวกรอง หรือเลือกวันที่อื่น` : 'วันนี้ยังไม่มีการมอบหมายงาน'}</Text></View> : filteredData.map((item, index) => {
                                // Dynamic colors matching web
                                let gradientAvatar = { bg: '#F1F5F9', text: '#64748B' };
                                if (item.status === 'pending') gradientAvatar = { bg: '#F59E0B', text: '#FFFFFF' };
                                else if (item.status === 'postponed') gradientAvatar = { bg: '#A855F7', text: '#FFFFFF' };
                                else if (item.status === 'processing') gradientAvatar = { bg: '#3B82F6', text: '#FFFFFF' };
                                else if (item.status === 'approved') gradientAvatar = { bg: '#10B981', text: '#FFFFFF' };

                                return (
                                <TouchableOpacity key={index} style={styles.reportCardGrand} onPress={() => openModal(item)} activeOpacity={0.9}>
                                    <View style={styles.reportHeaderGrand}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 }}>
                                            <View style={[styles.avatarCircleGrand, { backgroundColor: gradientAvatar.bg }]}><Text style={[styles.avatarTextGrand, { color: gradientAvatar.text }]}>{item.assigner_name.charAt(0).toUpperCase()}</Text></View>
                                            <View style={{ flex: 1 }}>
                                                <Text style={styles.reportNameGrand} numberOfLines={1}>{item.assigner_name}</Text>
                                                <Text style={styles.reportCompanyGrand}>{item.company ? item.company.replace(/,\s*/g, ', ') : '-'}</Text>
                                            </View>
                                        </View>
                                        <StatusBadge status={item.status} isDark={isDark} />
                                    </View>
                                    <View style={styles.reportBodyGrand}>
                                        <Text style={styles.reportActivityGrand} numberOfLines={2}>{item.activity}</Text>
                                        <View style={styles.reportLocationRow}>
                                            <MapPin size={16} color="#FB7185" />
                                            <Text style={styles.reportLocationGrand} numberOfLines={1}>{item.location}</Text>
                                        </View>
                                    </View>
                                    <View style={styles.reportFooterGrand}>
                                        <View style={styles.reportDateBadge}>
                                            <Calendar size={14} color={theme.textSecondary} />
                                            <Text style={styles.reportDateText}>{formatDate(item.work_date)}</Text>
                                        </View>
                                        <Text style={styles.reportCostGrand}>{item.final_cost ? `${Number(item.final_cost).toLocaleString()} ฿` : <Text style={{color: theme.textSecondary, fontSize: 14}}>- ไม่ระบุยอด -</Text>}</Text>
                                    </View>
                                </TouchableOpacity>
                            )})}
                        </View>
                    </View>
                </ScrollView>
            </SafeAreaView>

            {/* --- Modals (Company Picker & Image) --- */}
            <Modal visible={showCompanyModal} transparent animationType="fade" onRequestClose={() => setShowCompanyModal(false)}>
                <TouchableWithoutFeedback onPress={() => setShowCompanyModal(false)}>
                    <View style={styles.modalOverlay}>
                        <TouchableWithoutFeedback>
                            <View style={[styles.pickerModalContent, { backgroundColor: theme.cardSolid }]}>
                                <Text style={styles.pickerTitle}>เลือกสังกัดบริษัท</Text>
                                <ScrollView style={{ maxHeight: 350 }} contentContainerStyle={{ paddingBottom: 16 }} showsVerticalScrollIndicator={false}>
                                    <TouchableOpacity style={[styles.pickerItem, filterCompany === 'all' && styles.pickerItemActive]} onPress={() => { setFilterCompany('all'); setShowCompanyModal(false); }}>
                                        <Text style={[styles.pickerItemText, filterCompany === 'all' && styles.pickerItemTextActive]}>แสดงทุกบริษัท</Text>
                                        {filterCompany === 'all' && <Check size={20} color="#FFFFFF" />}
                                    </TouchableOpacity>
                                    {COMPANY_KEYS.map((comp) => (
                                        <TouchableOpacity key={comp} style={[styles.pickerItem, filterCompany === comp && styles.pickerItemActive]} onPress={() => { setFilterCompany(comp); setShowCompanyModal(false); }}>
                                            <Text style={[styles.pickerItemText, filterCompany === comp && styles.pickerItemTextActive]} numberOfLines={2}>{comp}</Text>
                                            {filterCompany === comp && <Check size={20} color="#FFFFFF" />}
                                        </TouchableOpacity>
                                    ))}
                                </ScrollView>
                            </View>
                        </TouchableWithoutFeedback>
                    </View>
                </TouchableWithoutFeedback>
            </Modal>

            <Modal visible={showImageModal} transparent={true} animationType="fade" onRequestClose={() => setShowImageModal(false)}>
                <View style={styles.fullImageContainer}>
                    <BlurView intensity={90} tint="dark" style={StyleSheet.absoluteFill} />
                    <TouchableOpacity style={styles.closeImageBtn} onPress={() => setShowImageModal(false)}><X size={36} color="white" /></TouchableOpacity>
                    {activeImageUrl && (<Image source={{ uri: activeImageUrl }} style={styles.fullScreenImage} resizeMode="contain" />)}
                </View>
            </Modal>

            {/* --- GRAND DETAIL MODAL (Web Match) --- */}
            <Modal visible={modalVisible} animationType="slide" transparent={true} onRequestClose={closeModal}>
                <View style={styles.modalOverlay}>
                    {/* Add BlurView for Glassmorphism modal background */}
                    <BlurView intensity={isDark ? 80 : 30} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFill} />
                    
                    <View style={styles.modalContentGrand}>
                        <View style={styles.modalHeaderGrand}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                                <View style={styles.listHeaderIconWrap}><CheckCircle2 size={24} color="#FFFFFF" /></View>
                                <View>
                                    <Text style={styles.modalTitleGrand}>รายละเอียดงาน</Text>
                                  <Text style={styles.modalSubtitleGrand}>
    <Calendar size={12} color={theme.textSecondary} /> {selectedReport?.work_date ? formatDate(selectedReport.work_date) : '-'}
</Text>
                                </View>
                            </View>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                                {selectedReport && <StatusBadge status={selectedReport.status} isDark={isDark} />}
                                <TouchableOpacity onPress={closeModal} style={styles.closeBtnGrand}><X size={24} color={theme.text} /></TouchableOpacity>
                            </View>
                        </View>

                        {selectedReport && (
                            <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
                                
                                <View style={styles.grandUserCard}>
                                    <View style={{ flexDirection: 'row', gap: 16, alignItems: 'center' }}>
                                        <View style={styles.avatarCircleHuge}><Text style={styles.avatarTextHuge}>{selectedReport.assigner_name.charAt(0).toUpperCase()}</Text></View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.grandUserLabel}>ผู้มอบงาน</Text>
                                            <Text style={styles.grandUserName}>{selectedReport.assigner_name}</Text>
                                            <View style={styles.grandCompanyTag}><Text style={styles.grandCompanyTagText}>{selectedReport.company ? selectedReport.company.replace(/,\s*/g, ', ') : '-'}</Text></View>
                                        </View>
                                    </View>
                                </View>

                                <JobTimeline report={selectedReport} isDark={isDark} />

                                {(selectedReport.extension_status === 'pending' || selectedReport.status === 'postponed') && (
                                    <View style={styles.grandAlertOverlayBox}>
                                        <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 6, backgroundColor: '#F59E0B', borderTopLeftRadius: 28, borderBottomLeftRadius: 28 }} />
                                        <View style={{ flexDirection: 'row', gap: 16 }}>
                                            <View style={{ flex: 1 }}>
                                                <Text style={styles.grandAlertOverlayTitle}><AlertTriangle size={18} color="#D97706" /> แจ้งขอเลื่อนงาน</Text>
                                                <Text style={styles.grandAlertOverlayText}>เหตุผล: {selectedReport.extension_reason || '-'}</Text>
                                                <Text style={styles.grandAlertOverlayText}>ขอเลื่อนไป: <Text style={{ fontWeight: '800', backgroundColor: '#FEF3C7', paddingHorizontal: 6, borderRadius: 6 }}>{selectedReport.requested_due_date ? formatDate(selectedReport.requested_due_date) : '-'}</Text></Text>
                                            </View>
                                            <TouchableOpacity style={styles.grandAlertOverlayBtn} onPress={cancelExtensionRequest}>
                                                <Text style={styles.grandAlertOverlayBtnText}>ยกเลิกคำขอ</Text>
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                )}

                                <View style={styles.grandSectionBlock}>
                                    <View style={styles.grandDetailBox}>
                                        <Text style={styles.grandSectionTitleSmall}><Layers size={16} color="#3B82F6" /> กิจกรรม / งานที่ต้องทำ</Text>
                                        <View style={styles.grandDetailActivityWrap}>
                                            <Text style={styles.grandDetailValueBig}>{selectedReport.activity}</Text>
                                        </View>

                                        <Text style={[styles.grandSectionTitleSmall, { marginTop: 24, color: '#F43F5E' }]}><MapPin size={16} color="#F43F5E" /> สถานที่ปฏิบัติงาน</Text>
                                        <View style={styles.grandLocationWrap}>
                                            <MapPin size={20} color="#F43F5E" />
                                            <Text style={styles.grandLocationText}>{selectedReport.location}</Text>
                                        </View>

                                        {selectedReport.status !== 'pending' && (
                                            <>
                                                <Text style={[styles.grandSectionTitleSmall, { marginTop: 24, color: '#3B82F6' }]}><UserCheck size={16} color="#3B82F6" /> ผู้กำลังดำเนินการ</Text>
                                                <View style={styles.grandProcessorBox}>
                                                    <View style={styles.grandProcessorIcon}><HardHat size={24} color="#FFF" /></View>
                                                    <View>
                                                        <Text style={styles.grandProcessorLabel}>รับผิดชอบโดย</Text>
                                                        <Text style={styles.grandProcessorValue}>
                                                            {selectedReport.status === 'approved' ? (selectedReport.completed_by_name || selectedReport.completed_by || selectedReport.accepted_by_name || '-') : (selectedReport.accepted_by_name || selectedReport.accepted_by || '-')}
                                                        </Text>
                                                    </View>
                                                </View>
                                            </>
                                        )}

                                        <Text style={[styles.grandSectionTitleSmall, { marginTop: 24, color: theme.textSecondary }]}><FilePlus size={16} color={theme.textSecondary} /> รายละเอียดเพิ่มเติม</Text>
                                        <View style={styles.grandDetailDetailsWrap}>
                                            <Text style={styles.grandDetailValue}>{selectedReport.details || '-'}</Text>
                                        </View>
                                    </View>
                                </View>

                                {selectedReport.history_log && selectedReport.history_log.length > 0 && (
                                    <View style={styles.grandSectionBlock}>
                                        <View style={[styles.grandHistoryBox, { backgroundColor: isDark ? 'rgba(59, 7, 100, 0.4)' : '#FAF5FF', borderColor: isDark ? '#6B21A8' : '#E9D5FF' }]}>
                                            <Text style={[styles.grandSectionTitleSmall, { color: '#9333EA' }]}><CalendarClock size={16} color="#9333EA" /> ประวัติการเลื่อนงาน</Text>
                                            <View style={{ marginTop: 16 }}>
                                                {selectedReport.history_log.map((log, idx) => (
                                                    <View key={idx} style={styles.grandHistoryItem}>
                                                        <View style={styles.grandHistoryDot} />
                                                        <View style={{ flex: 1 }}>
                                                            <View style={styles.grandHistoryTag}><Text style={styles.grandHistoryTagText}>ครั้งที่ {selectedReport.history_log!.length - idx} ({log.moved_at ? formatDate(log.moved_at) : '-'})</Text></View>
                                                            <Text style={styles.grandHistoryDesc}>เปลี่ยนจาก <Text style={{textDecorationLine: 'line-through', color: theme.textSecondary}}>{formatDate(log.old_date)}</Text> {'->'} <Text style={{fontWeight: '800', color: '#9333EA'}}>{formatDate(log.new_date)}</Text></Text>
                                                            <Text style={styles.grandHistoryUser}>"{log.reason}" (โดย {log.requested_by || 'Unknown'})</Text>
                                                        </View>
                                                    </View>
                                                ))}
                                            </View>
                                        </View>
                                    </View>
                                )}

                                {(selectedReport.image_path || selectedReport.completion_image) && (
                                    <View style={styles.grandSectionBlock}>
                                        <View style={styles.grandDetailBox}>
                                            {selectedReport.image_path && (
                                                <View style={{ marginBottom: selectedReport.completion_image ? 24 : 0 }}>
                                                    <Text style={[styles.grandSectionTitleSmall, { color: theme.textSecondary }]}><ImageOff size={16} color={theme.textSecondary} /> รูปหน้างาน (ก่อนทำ)</Text>
                                                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, marginTop: 12 }}>
                                                        {getImages(selectedReport.image_path, 'assign').map((imgUrl, idx) => (
                                                            <TouchableOpacity key={idx} onPress={() => openImageModal(imgUrl)} activeOpacity={0.9}>
                                                                <Image source={{ uri: imgUrl }} style={styles.grandImgThumb} />
                                                            </TouchableOpacity>
                                                        ))}
                                                    </ScrollView>
                                                </View>
                                            )}
                                            {selectedReport.completion_image && (
                                                <View>
                                                    <Text style={[styles.grandSectionTitleSmall, { color: '#10B981' }]}><CheckCircle2 size={16} color="#10B981" /> หลักฐานจบงาน</Text>
                                                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, marginTop: 12 }}>
                                                        {getImages(selectedReport.completion_image, 'completion').map((imgUrl, idx) => (
                                                            <TouchableOpacity key={idx} onPress={() => openImageModal(imgUrl)} activeOpacity={0.9}>
                                                                <Image source={{ uri: imgUrl }} style={styles.grandImgThumb} />
                                                            </TouchableOpacity>
                                                        ))}
                                                    </ScrollView>
                                                </View>
                                            )}
                                        </View>
                                    </View>
                                )}

                                {/* --- GRAND ACTIONS --- */}
                                <View style={{ height: 24 }} />
                                {selectedReport.status === 'pending' && (
                                    <View style={styles.grandActionRow}>
                                        <TouchableOpacity style={styles.grandBtnReject} onPress={confirmCancelJob} disabled={isSubmitting}>
                                            <Text style={styles.grandBtnRejectText}>ยกเลิกรายการ</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity style={styles.grandBtnAccept} onPress={confirmAcceptJob} disabled={isSubmitting}>
                                            {isSubmitting ? <ActivityIndicator color="#FFF" /> : <><Play size={20} color="#FFF" fill="#FFF" /><Text style={styles.grandBtnAcceptText}>รับงานทันที</Text></>}
                                        </TouchableOpacity>
                                    </View>
                                )}

                                {selectedReport.status === 'postponed' && (
                                    <View style={styles.grandActionRow}>
                                        <TouchableOpacity style={styles.grandBtnReject} onPress={confirmCancelJob} disabled={isSubmitting}>
                                            <Text style={styles.grandBtnRejectText}>ยกเลิกรายการ</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity style={[styles.grandBtnAccept, { backgroundColor: '#8B5CF6', shadowColor: '#8B5CF6' }]} onPress={confirmAcceptPostponed} disabled={isSubmitting}>
                                            {isSubmitting ? <ActivityIndicator color="#FFF" /> : <><PlayCircle size={20} color="#FFF" /><Text style={styles.grandBtnAcceptText}>เริ่มงาน (ตามวันเลื่อน)</Text></>}
                                        </TouchableOpacity>
                                    </View>
                                )}

                                {selectedReport.status === 'processing' && (
                                    <View style={styles.grandProcessingContainer}>
                                        <Text style={[styles.grandSectionTitleSmall, { color: '#10B981', borderBottomWidth: 1, borderBottomColor: theme.divider, paddingBottom: 12 }]}><CheckCircle2 size={16} color="#10B981" /> บันทึกผลการทำงาน</Text>
                                        
                                        <View style={styles.grandCostInputBox}>
                                            <Text style={styles.grandCostLabel}>ระบุค่าใช้จ่าย (บาท)</Text>
                                            <View style={styles.grandCostInputWrapper}>
                                                <Text style={styles.grandCostCurrency}>฿</Text>
                                                <TextInput style={styles.grandCostInput} placeholder="0.00" keyboardType="numeric" value={inputFinalCost} onChangeText={setInputFinalCost} placeholderTextColor={theme.textSecondary} />
                                            </View>
                                        </View>

                                        <TouchableOpacity style={styles.grandUploadBox} onPress={pickImages} activeOpacity={0.8}>
                                            <View style={styles.grandUploadIconCircle}><UploadCloud size={28} color="#3B82F6" /></View>
                                            <Text style={styles.grandUploadText}>แตะเพื่ออัปโหลดรูปจบงาน / สลิป</Text>
                                        </TouchableOpacity>

                                        {completionFiles.length > 0 && (
                                            <View style={styles.grandPreviewGrid}>
                                                <TouchableOpacity style={styles.grandPreviewAddBtn} onPress={pickImages}>
                                                    <FilePlus size={24} color="#3B82F6" />
                                                </TouchableOpacity>
                                                {completionFiles.map((file, idx) => (
                                                    <View key={idx} style={styles.grandPreviewItem}>
                                                        <Image source={{ uri: file.uri }} style={styles.grandPreviewImg} />
                                                        <TouchableOpacity style={styles.grandRemovePreviewBtn} onPress={() => removeImage(idx)}>
                                                            <X size={14} color="#FFF" strokeWidth={3} />
                                                        </TouchableOpacity>
                                                    </View>
                                                ))}
                                            </View>
                                        )}

                                        <View style={styles.grandActionRow}>
                                            <TouchableOpacity style={styles.grandBtnSecondary} onPress={openExtensionModal}>
                                                <CalendarClock size={20} color="#D97706" />
                                                <Text style={styles.grandBtnSecondaryText}>แจ้งขอเลื่อน</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity style={styles.grandBtnFinish} onPress={confirmFinishJob} disabled={isSubmitting}>
                                                {isSubmitting ? <ActivityIndicator color="#FFF" /> : <><CheckCircle2 size={22} color="#FFF" /><Text style={styles.grandBtnFinishText}>ยืนยันจบงาน</Text></>}
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                )}

                                {selectedReport.status === 'approved' && (
                                    <View style={styles.grandCompletedBadge}>
                                        <View style={{flexDirection: 'row', justifyContent: 'space-between', width: '100%', alignItems: 'center', marginBottom: 24}}>
                                            <Text style={styles.grandSectionTitleSmall}><CheckCircle2 size={16} color="#10B981" /> หลักฐานจบงาน</Text>
                                            <View style={{backgroundColor: theme.cardSolid, paddingHorizontal: 16, paddingVertical: 6, borderRadius: 12, borderWidth: 1, borderColor: '#A7F3D0'}}>
                                                <Text style={{fontSize: 18, fontWeight: '800', color: '#10B981'}}>{selectedReport.final_cost ? `${Number(selectedReport.final_cost).toLocaleString()} ฿` : '0 ฿'}</Text>
                                            </View>
                                        </View>
                                        <View style={styles.grandCompletedIconWrap}><CheckCircle2 size={40} color="#10B981" /></View>
                                        <Text style={styles.grandCompletedTitle}>งานเสร็จสิ้นสมบูรณ์</Text>
                                        <Text style={styles.grandCompletedSubtitle}>ดำเนินการโดย: {selectedReport.completed_by || '-'}</Text>
                                    </View>
                                )}
                            </ScrollView>
                        )}
                    </View>
                </View>
            </Modal>

            {/* Extension Request Modal */}
            <Modal visible={showExtensionModal} transparent animationType="fade" onRequestClose={() => setShowExtensionModal(false)}>
                <View style={[styles.modalOverlay, {justifyContent: 'center', alignItems: 'center'}]}>
                    <BlurView intensity={isDark ? 80 : 40} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFill} />
                    <View style={styles.grandExtModal}>
                        <Text style={styles.grandModalTitleCenter}>แจ้งขอเลื่อนกำหนดส่ง</Text>
                        
                        <Text style={styles.grandInputLabel}>ต้องการเลื่อนไปวันที่</Text>
                        <TouchableOpacity style={styles.grandDateInputBtn} onPress={() => setShowExtDatePicker(true)}>
                            <Text style={styles.grandDateInputText}>{formatDate(extensionDate.toISOString())}</Text>
                            <Calendar size={22} color="#F59E0B" />
                        </TouchableOpacity>
                        {showExtDatePicker && (<DateTimePicker value={extensionDate} mode="date" display="default" onChange={(e, d) => { if (Platform.OS === 'android') setShowExtDatePicker(false); if (d) setExtensionDate(d); }} minimumDate={new Date()} />)}

                        <Text style={styles.grandInputLabel}>สาเหตุ/หมายเหตุ</Text>
                        <TextInput style={styles.grandReasonInput} multiline numberOfLines={4} placeholder="ระบุสาเหตุที่งานไม่เสร็จ..." placeholderTextColor={theme.textSecondary} value={extensionReason} onChangeText={setExtensionReason} />

                        <View style={styles.grandActionRowModal}>
                            <TouchableOpacity style={styles.grandBtnOutlineModal} onPress={() => setShowExtensionModal(false)}><Text style={styles.grandBtnOutlineTextModal}>ยกเลิก</Text></TouchableOpacity>
                            <TouchableOpacity style={styles.grandBtnPrimaryModal} onPress={submitExtension}><Text style={styles.grandBtnPrimaryTextModal}>บันทึกการแจ้งเลื่อน</Text></TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            <BeautifulAlert visible={alertConfig.visible} type={alertConfig.type} title={alertConfig.title} message={alertConfig.message} children={alertConfig.children} confirmText={alertConfig.confirmText} cancelText={alertConfig.cancelText} showCancel={alertConfig.showCancel} onConfirm={alertConfig.onConfirm} onCancel={closeAlert} isDark={isDark} />
        </View>
    );
}

// 🔥 [JobTimeline] Sub Component (Revised to match web)
const JobTimeline = ({ report, isDark }: { report: Report, isDark: boolean }) => {
    const styles = getStyles(isDark);

    const getTimelineTime = (dateStr?: string | null) => {
        if (!dateStr || dateStr === '0000-00-00 00:00:00') return '-';
        try {
            const d = new Date(dateStr);
            if (isNaN(d.getTime())) return '-';
            const h = d.getHours().toString().padStart(2, '0');
            const m = d.getMinutes().toString().padStart(2, '0');
            return `${h}:${m}`;
        } catch { return '-'; }
    };

    const getTimelineDate = (dateStr?: string | null) => {
        if (!dateStr || dateStr === '0000-00-00 00:00:00') return '-';
        try {
            const d = new Date(dateStr);
            if (isNaN(d.getTime())) return '-';
            const day = d.getDate().toString().padStart(2, '0');
            const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
            return `${day} ${months[d.getMonth()]}`;
        } catch { return '-'; }
    };

    const sortedHistory = useMemo(() => {
        if (!report?.history_log) return [];
        return [...report.history_log].sort((a, b) => {
            const dateA = new Date(a.moved_at || 0).getTime();
            const dateB = new Date(b.moved_at || 0).getTime();
            return dateA - dateB;
        });
    }, [report]);

    const timelineNodes = [];

    // [Node 1] Assign
    timelineNodes.push({
        id: 'assign', icon: FilePlus, label: 'มอบหมาย', time: report.assigned_time || getTimelineTime(report.created_at), date: getTimelineDate(report.created_at), color: '#64748B', bg: isDark ? '#1E293B' : '#F1F5F9', active: true
    });

    // [Node 2...] History
    sortedHistory.forEach((log, index) => {
        timelineNodes.push({
            id: `postpone_${index}`, icon: CalendarClock, label: `เลื่อนครั้งที่ ${index + 1}`, time: getTimelineTime(log.moved_at), date: getTimelineDate(log.moved_at), color: '#A855F7', bg: isDark ? '#3B0764' : '#F3E8FF', active: true
        });
    });

    // [Node Last] Current Status
    if (report.status === 'postponed' || report.extension_status === 'pending') {
        timelineNodes.push({
            id: 'waiting', icon: Clock, label: 'รอเริ่มงาน', subLabel: 'สถานะล่าสุด', time: '', date: '', color: '#F59E0B', bg: isDark ? '#451a03' : '#FFFBEB', active: true, isCurrent: true
        });
    } else if (report.status === 'processing') {
        timelineNodes.push({
            id: 'started', icon: PlayCircle, label: 'เริ่มงาน', time: report.started_time || getTimelineTime(report.started_at), date: getTimelineDate(report.started_at), color: '#3B82F6', bg: isDark ? '#172554' : '#EFF6FF', active: true
        });
    } else if (report.status === 'approved') {
        timelineNodes.push({
            id: 'started', icon: PlayCircle, label: 'เริ่มงาน', time: report.started_time || getTimelineTime(report.started_at), date: getTimelineDate(report.started_at), color: '#3B82F6', bg: isDark ? '#172554' : '#EFF6FF', active: true
        });
        timelineNodes.push({
            id: 'completed', icon: CheckCircle2, label: 'เสร็จสิ้น', time: report.completed_time || getTimelineTime(report.completed_at), date: getTimelineDate(report.completed_at), color: '#10B981', bg: isDark ? '#064E3B' : '#ECFDF5', active: true
        });
    }

    return (
        <View style={styles.timelineContainer}>
            <View style={{flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16}}>
                <History size={16} color="#3B82F6" />
                <Text style={styles.timelineTitle}>ไทม์ไลน์การทำงาน</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.timelineScroll}>
                {timelineNodes.map((node, index) => {
                    const isLast = index === timelineNodes.length - 1;
                    return (
                        <View key={node.id} style={{ flexDirection: 'row' }}>
                            <TimelineItem icon={node.icon} label={node.label} subLabel={node.subLabel} time={node.time} date={node.date} active={node.active} color={node.color} bg={node.bg} isDark={isDark} hasLine={!isLast} />
                        </View>
                    );
                })}
            </ScrollView>
        </View>
    );
};

const StatCard = ({ label, value, icon: Icon, color, bg, border, onPress, active, isDark, fullWidth }: any) => {
    const theme = isDark ? Colors.dark : Colors.light;
    const styles = getStyles(isDark);
    return (
        <TouchableOpacity onPress={onPress} style={[styles.statCard, fullWidth && { width: '100%' }, active && { backgroundColor: bg, borderColor: border, borderWidth: 1 }]}>
            <View style={[styles.statIcon, { backgroundColor: bg }]}><Icon size={24} color={color} /></View>
            <Text style={styles.statLabel}>{label}</Text>
            <Text style={[styles.statValue, { color: active ? (isDark ? 'white' : color) : theme.text }]}>{value}</Text>
        </TouchableOpacity>
    );
}

const StatusBadge = ({ status, isDark }: { status: string, isDark: boolean }) => {
    const theme = isDark ? Colors.dark : Colors.light;
    const styles = getStyles(isDark);
    let color = theme.textSecondary, bg = isDark ? '#1E293B' : '#F1F5F9', label = 'Unknown', dotColor = '#94A3B8';
    if (status === 'pending') { color = '#EA580C'; bg = isDark ? '#431407' : '#FFF7ED'; label = 'มอบงาน'; dotColor = '#F97316'; }
    if (status === 'processing') { color = '#2563EB'; bg = isDark ? '#172554' : '#EFF6FF'; label = 'กำลังทำ'; dotColor = '#3B82F6'; }
    if (status === 'approved') { color = '#059669'; bg = isDark ? '#064E3B' : '#ECFDF5'; label = 'เสร็จสิ้น'; dotColor = '#10B981'; }
    if (status === 'cancelled') { color = '#DC2626'; bg = isDark ? '#450a0a' : '#FEF2F2'; label = 'ยกเลิก'; dotColor = '#EF4444'; }
    if (status === 'postponed') { color = '#7E22CE'; bg = isDark ? '#3B0764' : '#F3E8FF'; label = 'เลื่อนวัน'; dotColor = '#A855F7'; }
    return (
        <View style={[styles.statusBadge, { backgroundColor: bg, borderColor: color + '30', borderWidth: 1 }]}>
            <View style={{width: 8, height: 8, borderRadius: 4, backgroundColor: dotColor, marginRight: 6}} />
            <Text style={[styles.statusText, { color: color }]}>{label}</Text>
        </View>
    );
};

const TimelineItem = ({ icon: Icon, label, subLabel, time, date, active, color, bg, isDark, hasLine }: any) => {
    const theme = isDark ? Colors.dark : Colors.light;
    const styles = getStyles(isDark);
    return (
        <View style={styles.timelineItemWrapper}>
            <View style={{ alignItems: 'center', zIndex: 10 }}>
                <View style={[styles.timelineIcon, { backgroundColor: color }]}>
                    <Icon size={20} color="#FFFFFF" />
                </View>
            </View>
            <View style={{ alignItems: 'center', marginTop: 12 }}>
                <Text style={[styles.timelineTag, { color: color, borderColor: color + '50', backgroundColor: bg }]}>{label}</Text>
                {subLabel ? (
                    <Text style={[styles.timelineDate, { color: theme.textSecondary, marginTop: 4 }]}>{subLabel}</Text>
                ) : (
                    <>
                        <Text style={[styles.timelineTime, { color: theme.text }]}>{time}</Text>
                        <Text style={styles.timelineDate}>{date}</Text>
                    </>
                )}
            </View>
            {hasLine && <View style={[styles.timelineConnector, { backgroundColor: isDark ? '#334155' : '#E2E8F0' }]} />}
        </View>
    );
}

const getStyles = (isDark: boolean) => {
    const theme = isDark ? Colors.dark : Colors.light;
    return StyleSheet.create({
        container: { flex: 1, backgroundColor: theme.background },
        scrollContent: { paddingBottom: 60 },
        ambientBlob: { position: 'absolute', width: 300, height: 300, borderRadius: 150, zIndex: 0 },
        
        // Header (Web Match)
        grandHeader: { paddingHorizontal: 24, paddingTop: 40, paddingBottom: 20, zIndex: 10 },
        headerTopRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
        headerTitle: { fontSize: 32, fontWeight: '900', color: theme.text, letterSpacing: -0.5 },
        headerSubtitleBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: theme.card, paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20, alignSelf: 'flex-start', marginTop: 8, borderWidth: 1, borderColor: theme.border },
        headerSubtitleText: { fontSize: 14, color: theme.textSecondary, fontWeight: '700' },
        
        sectionContainer: { zIndex: 20 },
        
        // Alerts
        grandAlertBoxRed: { backgroundColor: isDark ? 'rgba(69, 10, 10, 0.8)' : 'rgba(254, 242, 242, 0.9)', borderRadius: 24, padding: 20, flexDirection: 'row', alignItems: 'center', gap: 16, shadowColor: '#EF4444', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 16, elevation: 5, borderWidth: 1, borderColor: isDark ? '#7f1d1d' : '#FECACA' },
        alertIconWrapperRed: { width: 52, height: 52, borderRadius: 26, backgroundColor: isDark ? '#991b1b' : '#FEE2E2', alignItems: 'center', justifyContent: 'center' },
        grandAlertTitleRed: { fontSize: 18, fontWeight: '900', color: isDark ? '#fca5a5' : '#B91C1C' },
        grandAlertSubtitleRed: { fontSize: 13, color: isDark ? '#f87171' : '#EF4444', marginTop: 4, fontWeight: '600' },
        grandAlertBtnRed: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#EF4444', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 16, shadowColor: '#EF4444', shadowOpacity: 0.3, shadowOffset: {width: 0, height: 4}, shadowRadius: 8 },
        grandAlertBtnTextRed: { fontSize: 14, fontWeight: '800', color: '#FFFFFF' },

        grandAlertBoxBlue: { backgroundColor: isDark ? 'rgba(23, 37, 84, 0.8)' : 'rgba(239, 246, 255, 0.9)', borderRadius: 24, padding: 20, flexDirection: 'row', alignItems: 'center', gap: 16, shadowColor: '#3B82F6', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 16, elevation: 5, borderWidth: 1, borderColor: isDark ? '#1e3a8a' : '#BFDBFE' },
        alertIconWrapperBlue: { width: 52, height: 52, borderRadius: 26, backgroundColor: isDark ? '#1e40af' : '#DBEAFE', alignItems: 'center', justifyContent: 'center' },
        grandAlertTitleBlue: { fontSize: 18, fontWeight: '900', color: isDark ? '#93c5fd' : '#1D4ED8' },
        grandAlertSubtitleBlue: { fontSize: 13, color: isDark ? '#60a5fa' : '#3B82F6', marginTop: 4, fontWeight: '600' },
        grandAlertBtnBlue: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#3B82F6', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 16, shadowColor: '#3B82F6', shadowOpacity: 0.3, shadowOffset: {width: 0, height: 4}, shadowRadius: 8 },
        grandAlertBtnTextBlue: { fontSize: 14, fontWeight: '800', color: '#FFFFFF' },

        activeHeaderRed: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: isDark ? 'rgba(69, 10, 10, 0.5)' : '#FFF5F5', padding: 16, borderRadius: 20, borderWidth: 1, borderColor: isDark ? '#7f1d1d' : '#FECACA' },
        activeIconBoxRed: { width: 40, height: 40, borderRadius: 12, backgroundColor: isDark ? '#991b1b' : '#FEE2E2', alignItems: 'center', justifyContent: 'center' },
        activeHeaderTextRed: { fontSize: 16, fontWeight: '800', color: isDark ? '#fca5a5' : '#DC2626' },
        
        activeHeaderBlue: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: isDark ? 'rgba(23, 37, 84, 0.5)' : '#F0F9FF', padding: 16, borderRadius: 20, borderWidth: 1, borderColor: isDark ? '#1e3a8a' : '#BAE6FD' },
        activeIconBoxBlue: { width: 40, height: 40, borderRadius: 12, backgroundColor: isDark ? '#1e40af' : '#E0F2FE', alignItems: 'center', justifyContent: 'center' },
        activeHeaderTextBlue: { fontSize: 16, fontWeight: '800', color: isDark ? '#93c5fd' : '#0284C7' },

        backlogBackBtn: { flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: theme.cardSolid, borderRadius: 14, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 5, elevation: 2 },

        // Sections
        sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16, paddingHorizontal: 24, marginTop: 10 },
        sectionHeaderIconWrap: { backgroundColor: 'rgba(99, 102, 241, 0.2)', padding: 6, borderRadius: 8 },
        pulsingDot: { width: 10, height: 10, backgroundColor: '#6366f1', borderRadius: 5 },
        sectionTitle: { fontSize: 14, fontWeight: '800', color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: 1 },
        
        // Grid Options (Glassmorphism Web Match)
        companyGridContainer: { paddingHorizontal: 24, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 16 },
        companyGridCard: { width: (SCREEN_WIDTH - 48 - 16) / 2, borderRadius: 32, padding: 24, marginBottom: 4, alignItems: 'flex-start', shadowColor: isDark ? '#000' : '#94A3B8', shadowOffset: { width: 0, height: 8 }, shadowOpacity: isDark ? 0.4 : 0.1, shadowRadius: 20, elevation: 4 },
        gridLogoBox: { width: 64, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center', padding: 12, marginBottom: 20, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8 },
        companyLogo: { width: '100%', height: '100%' },
        gridCompanyName: { fontSize: 13, fontWeight: '800', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 },
        gridCompanyCost: { fontSize: 28, fontWeight: '900' },

        // Stats Grid
        gridContainer: { flexDirection: 'row', flexWrap: 'wrap', padding: 24, gap: 16 },
        statCard: { width: (SCREEN_WIDTH - 48 - 16) / 2, backgroundColor: theme.card, borderRadius: 28, padding: 20, shadowColor: isDark ? '#000' : '#94A3B8', shadowOffset: { width: 0, height: 6 }, shadowOpacity: isDark ? 0.3 : 0.08, shadowRadius: 16, elevation: 4, borderWidth: 1, borderColor: theme.border },
        statCardFull: { width: '100%', backgroundColor: isDark ? 'rgba(136, 19, 55, 0.5)' : 'rgba(255, 241, 242, 0.8)', borderRadius: 40, padding: 32, shadowColor: isDark ? '#000' : '#F43F5E', shadowOffset: { width: 0, height: 8 }, shadowOpacity: isDark ? 0.4 : 0.1, shadowRadius: 20, elevation: 6, borderWidth: 1, borderColor: isDark ? '#be123c' : '#ffe4e6' },
        statIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
        statLabel: { fontSize: 12, color: theme.textSecondary, fontWeight: '800', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 },
        statValue: { fontSize: 32, fontWeight: '900', color: theme.text },
        
        statIconLarge: { width: 72, height: 72, backgroundColor: '#F43F5E', borderRadius: 24, alignItems: 'center', justifyContent: 'center', shadowColor: '#F43F5E', shadowOpacity: 0.4, shadowRadius: 16, elevation: 8 },
        statLabelBig: { fontSize: 14, color: isDark ? '#fda4af' : '#E11D48', fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 },
        statValueGrand: { fontSize: 44, color: isDark ? '#f43f5e' : '#E11D48', fontWeight: '900' },
        flexRowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },

        // List Section (Web Match)
        listSection: { paddingHorizontal: 24 },
        listHeaderGlass: { backgroundColor: theme.card, padding: 20, borderRadius: 24, marginBottom: 16, borderWidth: 1, borderColor: theme.border, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10 },
        listHeaderIconWrap: { width: 48, height: 48, backgroundColor: '#3B82F6', borderRadius: 16, alignItems: 'center', justifyContent: 'center', shadowColor: '#3B82F6', shadowOpacity: 0.3, shadowRadius: 8 },
        listHeaderTitle: { fontSize: 20, fontWeight: '900', color: theme.text },
        listHeaderSubtitle: { fontSize: 14, fontWeight: '600', color: theme.textSecondary, marginTop: 4 },

        filterRowBox: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 24 },
        dropdownHeader: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: theme.cardSolid, paddingHorizontal: 20, paddingVertical: 14, borderRadius: 20, borderWidth: 1, borderColor: theme.borderSolid, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5 },
        dropdownTitle: { fontSize: 15, fontWeight: '800', color: theme.text },
        
        dateButton: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: theme.cardSolid, paddingHorizontal: 20, paddingVertical: 14, borderRadius: 20, borderWidth: 1, borderColor: theme.borderSolid, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5 },
        dateButtonActive: { backgroundColor: '#3B82F6', borderColor: '#3B82F6' },
        dateButtonText: { color: theme.text, fontWeight: '800', fontSize: 14 },
        dateButtonTextActive: { color: '#FFFFFF' },
        clearDateBtn: { padding: 14, backgroundColor: '#FEF2F2', borderRadius: 16, alignItems: 'center', justifyContent: 'center' },

        // Grand Report Card (Web Match)
        reportCardGrand: { backgroundColor: theme.card, borderRadius: 32, padding: 24, marginBottom: 16, shadowColor: isDark ? '#000' : '#64748B', shadowOffset: { width: 0, height: 8 }, shadowOpacity: isDark ? 0.3 : 0.08, shadowRadius: 20, elevation: 5, borderWidth: 1, borderColor: theme.border },
        reportHeaderGrand: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
        avatarCircleGrand: { width: 52, height: 52, borderRadius: 20, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8 },
        avatarTextGrand: { fontWeight: '900', fontSize: 22 },
        reportNameGrand: { fontSize: 18, fontWeight: '900', color: theme.text },
        reportCompanyGrand: { fontSize: 11, color: theme.textSecondary, marginTop: 6, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 },
        reportBodyGrand: { marginBottom: 20, borderLeftWidth: 2, borderLeftColor: theme.borderSolid, paddingLeft: 16, marginLeft: 24 },
        reportActivityGrand: { fontSize: 16, fontWeight: '700', color: theme.text, lineHeight: 24, marginBottom: 12 },
        reportLocationRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: isDark ? 'rgba(15, 23, 42, 0.5)' : '#F8FAFC', padding: 10, borderRadius: 12, borderWidth: 1, borderColor: theme.borderSolid },
        reportLocationGrand: { fontSize: 13, color: theme.textSecondary, fontWeight: '600', flex: 1 },
        reportFooterGrand: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', paddingTop: 16, borderTopWidth: 1, borderTopColor: theme.borderSolid },
        reportDateBadge: { flexDirection: 'row', alignItems: 'center', gap: 6 },
        reportDateText: { fontSize: 13, fontWeight: '800', color: theme.textSecondary },
        reportCostGrand: { fontSize: 24, fontWeight: '900', color: '#10B981' },
        statusBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
        statusText: { fontSize: 12, fontWeight: '800' },

        // Modal Content Grand
        modalOverlay: { flex: 1, backgroundColor: 'transparent', justifyContent: 'flex-end' },
       modalContentGrand: { 
    width: '100%', 
    backgroundColor: theme.cardSolid, // 👈 เปลี่ยนตรงนี้เป็น theme.cardSolid (สีทึบ 100%)
    borderTopLeftRadius: 40, 
    borderTopRightRadius: 40, 
    height: '90%', 
    shadowColor: '#000', 
    shadowOffset: {width: 0, height: -10}, 
    shadowOpacity: 0.2, 
    shadowRadius: 30, 
    elevation: 20 
    // ลบ borderWidth และ borderColor ออก เพื่อให้ดูเป็นกล่องทึบเนียนๆ
},
        modalHeaderGrand: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 28, paddingTop: 32, paddingBottom: 24, borderBottomWidth: 1, borderBottomColor: theme.borderSolid },
        modalTitleGrand: { fontSize: 24, fontWeight: '900', color: theme.text, letterSpacing: -0.5 },
        modalSubtitleGrand: { fontSize: 14, color: theme.textSecondary, fontWeight: '700', marginTop: 4 },
        closeBtnGrand: { width: 44, height: 44, borderRadius: 22, backgroundColor: theme.subBlockBg, alignItems: 'center', justifyContent: 'center' },

        grandUserCard: { backgroundColor: theme.cardSolid, padding: 24, borderRadius: 32, marginBottom: 24, shadowColor: isDark ? '#000' : '#E2E8F0', shadowOpacity: 0.5, shadowRadius: 16, elevation: 4, borderWidth: 1, borderColor: theme.borderSolid },
        avatarCircleHuge: { width: 64, height: 64, borderRadius: 24, backgroundColor: theme.subBlockBg, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.borderSolid },
        avatarTextHuge: { fontSize: 28, fontWeight: '900', color: theme.textSecondary },
        grandUserLabel: { fontSize: 12, color: '#3B82F6', fontWeight: '800', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 },
        grandUserName: { fontSize: 22, fontWeight: '900', color: theme.text },
        grandCompanyTag: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
        grandCompanyTagText: { fontSize: 11, fontWeight: '800', color: theme.textSecondary, backgroundColor: theme.background, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: theme.borderSolid },

        grandSectionBlock: { backgroundColor: theme.cardSolid, borderRadius: 32, padding: 24, marginBottom: 24, borderWidth: 1, borderColor: theme.borderSolid, shadowColor: isDark ? '#000' : '#E2E8F0', shadowOpacity: 0.5, shadowRadius: 16, elevation: 4 },
        grandSectionTitleSmall: { fontSize: 14, fontWeight: '900', color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 },
        grandDetailBox: {},
        grandDetailActivityWrap: { backgroundColor: theme.subBlockBg, padding: 20, borderRadius: 24, borderWidth: 1, borderColor: theme.borderSolid },
        grandDetailValueBig: { fontSize: 18, color: theme.text, fontWeight: '800', lineHeight: 28 },
        grandLocationWrap: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: isDark ? 'rgba(159, 18, 57, 0.2)' : '#FFF1F2', padding: 16, borderRadius: 20, borderWidth: 1, borderColor: isDark ? '#9f1239' : '#FFE4E6' },
        grandLocationText: { fontSize: 15, color: theme.text, fontWeight: '600', flex: 1 },
        grandDetailDetailsWrap: { backgroundColor: theme.subBlockBg, padding: 20, borderRadius: 24, borderWidth: 1, borderColor: theme.borderSolid, minHeight: 100 },
        grandDetailValue: { fontSize: 16, color: theme.textSecondary, fontWeight: '500', lineHeight: 24 },

        grandHistoryBox: { borderRadius: 32, padding: 24, borderWidth: 1 },
        grandHistoryItem: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 24, paddingLeft: 16, borderLeftWidth: 2, borderLeftColor: isDark ? '#6B21A8' : '#D8B4FE' },
        grandHistoryDot: { position: 'absolute', left: -9, top: 4, width: 16, height: 16, borderRadius: 8, backgroundColor: '#FFFFFF', borderWidth: 4, borderColor: '#A855F7' },
        grandHistoryTag: { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : '#FFFFFF', alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, marginBottom: 8 },
        grandHistoryTagText: { fontSize: 11, fontWeight: '900', color: '#9333EA', textTransform: 'uppercase', letterSpacing: 1 },
        grandHistoryDesc: { fontSize: 16, color: theme.text, fontWeight: '600', marginBottom: 6 },
        grandHistoryUser: { fontSize: 13, color: theme.textSecondary, fontWeight: '500', fontStyle: 'italic' },

        grandAlertOverlayBox: { backgroundColor: '#FFFBEB', borderRadius: 28, padding: 24, marginBottom: 24, borderWidth: 1, borderColor: '#FEF3C7', shadowColor: '#F59E0B', shadowOpacity: 0.1, shadowRadius: 12, overflow: 'hidden' },
        grandAlertOverlayTitle: { fontSize: 16, fontWeight: '900', color: '#D97706', marginBottom: 8 },
        grandAlertOverlayText: { fontSize: 14, color: '#B45309', marginBottom: 6, fontWeight: '600' },
        grandAlertOverlayBtn: { backgroundColor: '#FEF3C7', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 16, justifyContent: 'center' },
        grandAlertOverlayBtnText: { color: '#D97706', fontWeight: '900', fontSize: 14 },

        grandProcessorBox: { flexDirection: 'row', alignItems: 'center', gap: 16, backgroundColor: isDark ? 'rgba(23, 37, 84, 0.5)' : '#EFF6FF', padding: 20, borderRadius: 24, borderWidth: 1, borderColor: isDark ? '#1e3a8a' : '#BFDBFE' },
        grandProcessorIcon: { width: 56, height: 56, borderRadius: 20, backgroundColor: '#3B82F6', alignItems: 'center', justifyContent: 'center', shadowColor: '#3B82F6', shadowOpacity: 0.3, shadowRadius: 8 },
        grandProcessorLabel: { fontSize: 11, color: '#3B82F6', fontWeight: '800', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 },
        grandProcessorValue: { fontSize: 20, fontWeight: '900', color: theme.text },

        grandImgThumb: { width: 100, height: 100, borderRadius: 24, borderWidth: 1, borderColor: theme.borderSolid },

        grandActionRow: { flexDirection: 'row', gap: 16 },
        grandBtnReject: { flex: 1, backgroundColor: theme.cardSolid, paddingVertical: 18, borderRadius: 24, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: isDark ? '#7f1d1d' : '#FECACA' },
        grandBtnRejectText: { color: '#EF4444', fontSize: 16, fontWeight: '900' },
        grandBtnAccept: { flex: 1.5, flexDirection: 'row', gap: 10, backgroundColor: '#3B82F6', paddingVertical: 18, borderRadius: 24, alignItems: 'center', justifyContent: 'center', shadowColor: '#3B82F6', shadowOpacity: 0.3, shadowRadius: 12, elevation: 5 },
        grandBtnAcceptText: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },

        grandProcessingContainer: { backgroundColor: isDark ? 'rgba(15, 23, 42, 0.8)' : 'rgba(255, 255, 255, 0.6)', padding: 24, borderRadius: 32, borderWidth: 1, borderColor: theme.borderSolid },
        grandCostInputBox: { marginBottom: 24, marginTop: 12 },
        grandCostLabel: { fontSize: 12, fontWeight: '900', color: theme.textSecondary, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 },
        grandCostInputWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.cardSolid, borderRadius: 24, borderWidth: 2, borderColor: theme.borderSolid, paddingHorizontal: 24 },
        grandCostCurrency: { fontSize: 24, fontWeight: '900', color: theme.textSecondary },
        grandCostInput: { flex: 1, paddingVertical: 20, fontSize: 32, fontWeight: '900', color: '#10B981', textAlign: 'right' },

        grandUploadBox: { flexDirection: 'column', alignItems: 'center', gap: 16, padding: 32, borderRadius: 28, backgroundColor: isDark ? 'rgba(23, 37, 84, 0.3)' : '#EFF6FF', borderWidth: 2, borderColor: isDark ? '#1e3a8a' : '#BFDBFE', borderStyle: 'dashed', marginBottom: 24 },
        grandUploadIconCircle: { width: 64, height: 64, borderRadius: 24, backgroundColor: theme.cardSolid, alignItems: 'center', justifyContent: 'center', shadowColor: '#3B82F6', shadowOpacity: 0.15, shadowRadius: 12 },
        grandUploadText: { fontSize: 15, fontWeight: '800', color: '#3B82F6' },

        grandPreviewGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 24 },
        grandPreviewAddBtn: { width: 90, height: 90, borderRadius: 24, borderWidth: 2, borderColor: '#BFDBFE', borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', backgroundColor: isDark ? 'rgba(23, 37, 84, 0.3)' : '#EFF6FF' },
        grandPreviewItem: { width: 90, height: 90, borderRadius: 24, overflow: 'hidden', borderWidth: 1, borderColor: theme.borderSolid },
        grandPreviewImg: { width: '100%', height: '100%' },
        grandRemovePreviewBtn: { position: 'absolute', top: 6, right: 6, backgroundColor: 'rgba(239, 68, 68, 0.9)', padding: 6, borderRadius: 12 },

        grandBtnSecondary: { flex: 1, flexDirection: 'row', gap: 8, backgroundColor: theme.cardSolid, paddingVertical: 18, borderRadius: 24, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.borderSolid },
        grandBtnSecondaryText: { color: '#D97706', fontSize: 16, fontWeight: '900' },
        grandBtnFinish: { flex: 1.5, flexDirection: 'row', gap: 10, backgroundColor: '#10B981', paddingVertical: 18, borderRadius: 24, alignItems: 'center', justifyContent: 'center', shadowColor: '#10B981', shadowOpacity: 0.3, shadowRadius: 12, elevation: 5 },
        grandBtnFinishText: { color: '#FFFFFF', fontSize: 16, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1 },

        grandCompletedBadge: { backgroundColor: isDark ? 'rgba(6, 78, 59, 0.4)' : '#ECFDF5', padding: 32, borderRadius: 32, borderWidth: 1, borderColor: isDark ? '#047857' : '#A7F3D0', alignItems: 'center' },
        grandCompletedIconWrap: { width: 80, height: 80, borderRadius: 40, backgroundColor: theme.cardSolid, alignItems: 'center', justifyContent: 'center', marginBottom: 16, shadowColor: '#10B981', shadowOpacity: 0.2, shadowRadius: 12 },
        grandCompletedTitle: { fontSize: 20, fontWeight: '900', color: '#10B981', marginBottom: 8 },
        grandCompletedSubtitle: { fontSize: 14, color: isDark ? '#a7f3d0' : '#059669', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },

        // Picker Modal
        pickerModalContent: { width: '100%', maxWidth: 360, borderRadius: 40, padding: 32, alignSelf: 'center', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 20 },
        pickerTitle: { fontSize: 20, fontWeight: '900', color: theme.text, marginBottom: 24, textAlign: 'center' },
        pickerItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 20, paddingHorizontal: 24, borderRadius: 24, marginBottom: 12, backgroundColor: theme.subBlockBg },
        pickerItemActive: { backgroundColor: '#3B82F6' },
        pickerItemText: { fontSize: 16, color: theme.textSecondary, fontWeight: '800', flex: 1 },
        pickerItemTextActive: { color: '#FFFFFF' },

        // Extension Modal
        grandExtModal: { width: '100%', maxWidth: 360, backgroundColor: theme.cardSolid, borderRadius: 40, padding: 32, alignSelf: 'center', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 20 },
        grandModalTitleCenter: { fontSize: 22, fontWeight: '900', color: theme.text, marginBottom: 32, textAlign: 'center' },
        grandInputLabel: { fontSize: 12, fontWeight: '900', color: theme.textSecondary, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 },
        grandDateInputBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: theme.inputBg, paddingHorizontal: 24, paddingVertical: 20, borderRadius: 24, borderWidth: 1, borderColor: theme.borderSolid, marginBottom: 24 },
        grandDateInputText: { fontSize: 16, fontWeight: '800', color: theme.text },
        grandReasonInput: { backgroundColor: theme.inputBg, borderWidth: 1, borderColor: theme.borderSolid, borderRadius: 24, padding: 24, fontSize: 16, color: theme.text, textAlignVertical: 'top', minHeight: 140, fontWeight: '600' },
        grandActionRowModal: { flexDirection: 'row', gap: 16, marginTop: 32 },
        grandBtnOutlineModal: { flex: 1, paddingVertical: 18, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.subBlockBg },
        grandBtnOutlineTextModal: { fontSize: 16, fontWeight: '900', color: theme.textSecondary },
        grandBtnPrimaryModal: { flex: 1.5, paddingVertical: 18, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F59E0B', shadowColor: '#F59E0B', shadowOpacity: 0.3, shadowRadius: 10 },
        grandBtnPrimaryTextModal: { fontSize: 16, fontWeight: '900', color: '#FFFFFF' },

        // Others
        loadingContainer: { padding: 60, alignItems: 'center' },
        loadingText: { marginTop: 16, color: theme.textSecondary, fontSize: 16, fontWeight: '700' },
        emptyState: { padding: 60, alignItems: 'center', backgroundColor: theme.card, borderRadius: 32, marginTop: 20, borderWidth: 1, borderColor: theme.border },
        emptyIconBox: { width: 80, height: 80, backgroundColor: theme.subBlockBg, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
        emptyTitle: { fontSize: 20, fontWeight: '900', color: theme.text },
        emptyText: { color: theme.textSecondary, textAlign: 'center', marginTop: 10, fontSize: 15, lineHeight: 24, fontWeight: '500' },
        fullImageContainer: { flex: 1, backgroundColor: 'transparent', justifyContent: 'center' },
        fullScreenImage: { width: '100%', height: '80%' },
        closeImageBtn: { position: 'absolute', top: 60, right: 24, zIndex: 10, padding: 12, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 24 },

        // Timeline Ext (Web Match)
        timelineContainer: { marginBottom: 24, padding: 24 },
        timelineTitle: { fontSize: 14, fontWeight: '900', color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: 1 },
        timelineScroll: { paddingRight: 20, alignItems: 'flex-start', paddingTop: 10 },
        timelineItemWrapper: { alignItems: 'center', width: 90, marginRight: 0 },
        timelineConnector: { position: 'absolute', top: 22, left: 60, width: 60, height: 2, zIndex: 0 },
        timelineIcon: { width: 44, height: 44, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 12, zIndex: 20, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 5 },
        timelineTag: { fontSize: 10, fontWeight: '900', marginBottom: 6, textAlign: 'center', borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, overflow: 'hidden' },
        timelineTime: { fontSize: 16, fontWeight: '900', marginBottom: 2, textAlign: 'center' },
        timelineDate: { fontSize: 12, textAlign: 'center', fontWeight: '600' },
    });
};