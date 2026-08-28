// app/(tabs)/correspondence_book.tsx
// ระบบสารบรรณ — จอ B: บันทึกทะเบียน (correspondence_book.php)
// ดู docs/Correspondence_Spec.md

import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import DateTimePicker from "@react-native-community/datetimepicker";
import axios from "axios";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useColorScheme,
  View,
} from "react-native";

import { API_BASE } from "../../constants/config";

const api = axios.create({ baseURL: API_BASE, withCredentials: true });
const CORR_URL = "/api_correspondence.php";

const COLORS = {
  light: {
    bg: "#f1f5f9",
    bgSecondary: "#f8fafc",
    card: "#ffffff",
    text: "#1e293b",
    textSecondary: "#64748b",
    border: "#e2e8f0",
    primary: "#4e54c8",
    received: "#3b82f6",
    sent: "#f59e0b",
    success: "#16a34a",
    danger: "#ef4444",
    overlay: "rgba(0,0,0,0.5)",
  },
  dark: {
    bg: "#0f172a",
    bgSecondary: "#1e293b",
    card: "#1e293b",
    text: "#f1f5f9",
    textSecondary: "#cbd5e1",
    border: "#334155",
    primary: "#8f94fb",
    received: "#60a5fa",
    sent: "#fbbf24",
    success: "#22c55e",
    danger: "#f87171",
    overlay: "rgba(0,0,0,0.7)",
  },
};

type BookType = "received" | "sent";

interface FormState {
  id?: number;
  reg_no: string;
  book_date: string; // YYYY-MM-DD
  doc_date: string;
  ref_no: string;
  sender: string;
  company: string;
  internal_staff: string;
  subject: string;
  note: string;
}

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const emptyForm = (staff: string): FormState => ({
  reg_no: "",
  book_date: todayISO(),
  doc_date: "",
  ref_no: "",
  sender: "",
  company: "",
  internal_staff: staff,
  subject: "",
  note: "",
});

// label ต่างกันตามประเภท (ดู spec ข้อ 5)
const LABELS: Record<
  BookType,
  { sender: string; internal: string; senderReq: boolean; internalReq: boolean }
> = {
  received: {
    sender: "จาก (ผู้ส่งภายนอก)",
    internal: "ผู้เขียน / ผู้รับผิดชอบ (ภายใน)",
    senderReq: false,
    internalReq: false,
  },
  sent: {
    sender: "ผู้เขียน / เจ้าของเรื่อง (ภายใน)",
    internal: "ชื่อผู้รับ / หน่วยงาน",
    senderReq: false,
    internalReq: true,
  },
};

export default function CorrespondenceBook() {
  const scheme = useColorScheme();
  const isDark = scheme === "dark";
  const c = isDark ? COLORS.dark : COLORS.light;
  const s = useMemo(() => getStyles(c), [c]);

  const [bookType, setBookType] = useState<BookType>("received");
  const [fullname, setFullname] = useState("");

  const [list, setList] = useState<any[]>([]);
  const [subjectsMine, setSubjectsMine] = useState<string[]>([]);
  const [subjectsAll, setSubjectsAll] = useState<string[]>([]);
  const [companies, setCompanies] = useState<{ name: string; logo?: string }[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [search, setSearch] = useState("");
  const [filterDate, setFilterDate] = useState("");
  const [showListDate, setShowListDate] = useState(false);
  const isSearching = search.trim().length > 0;

  // แบ่งหน้าละ 50 รายการ
  const PAGE_SIZE = 50;
  const [page, setPage] = useState(1);

  // Form modal
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm(""));
  const [saving, setSaving] = useState(false);
  const [showBookDate, setShowBookDate] = useState(false);
  const [showDocDate, setShowDocDate] = useState(false);
  const [subjFocus, setSubjFocus] = useState(false);
  const [compFocus, setCompFocus] = useState(false);

  const labels = LABELS[bookType];

  // คืนชื่อผู้ใช้กลับมาด้วย (ไม่ใช่แค่ setState) เพราะ state อัปเดตแบบ async
  // ถ้า loadAll เรียก fetchList() ต่อทันทีโดยอ้างจาก state `fullname` เฉยๆ
  // จะยังเห็นค่าเก่า (ว่าง) อยู่ ทำให้หน้าแรกที่เปิดมาไม่ได้กรองด้วยชื่อผู้ใช้
  // (API จะไม่กรอง creator ถ้า user param ว่าง → โชว์ของทุกคนแทนของตัวเอง)
  const loadUser = async (): Promise<string> => {
    try {
      const raw = await AsyncStorage.getItem("user");
      if (raw) {
        const u = JSON.parse(raw);
        const name = (u.fullname || u.name || u.username || "").trim();
        setFullname(name);
        return name;
      }
    } catch {}
    return "";
  };

  // ปกติ (ไม่ค้นหา) ดึงเฉพาะประเภทตามแท็บที่เลือก
  // ตอนค้นหา (มีคำค้น) ดึงทั้ง 2 ประเภทมารวมกัน เพื่อให้กรองข้ามแท็บได้
  const fetchList = async (opts?: {
    search?: string;
    date?: string;
    type?: BookType;
    user?: string;
  }) => {
    const searchTerm = (opts?.search ?? search).trim();
    const dateTerm = opts?.date ?? filterDate;
    const typeTerm = opts?.type ?? bookType;
    const userTerm = opts?.user ?? fullname;
    try {
      if (searchTerm) {
        const [rReceived, rSent] = await Promise.all([
          api.get(CORR_URL, {
            params: {
              action: "fetch",
              type: "received",
              search: searchTerm,
              ...(dateTerm ? { start: dateTerm } : {}),
              user: userTerm,
            },
          }),
          api.get(CORR_URL, {
            params: {
              action: "fetch",
              type: "sent",
              search: searchTerm,
              ...(dateTerm ? { start: dateTerm } : {}),
              user: userTerm,
            },
          }),
        ]);
        const lr = (rReceived.data?.list || []).map((it: any) => ({
          ...it,
          book_type: it.book_type || "received",
        }));
        const ls = (rSent.data?.list || []).map((it: any) => ({
          ...it,
          book_type: it.book_type || "sent",
        }));
        const merged = [...lr, ...ls].sort((a, b) => {
          const byDate = String(b.book_date || "").localeCompare(
            String(a.book_date || ""),
          );
          return byDate !== 0
            ? byDate
            : (Number(b.id) || 0) - (Number(a.id) || 0);
        });
        setList(merged);
        setSubjectsMine(
          Array.from(
            new Set([
              ...(rReceived.data?.subjects_my_history || []),
              ...(rSent.data?.subjects_my_history || []),
            ]),
          ),
        );
        setSubjectsAll(
          Array.from(
            new Set([
              ...(rReceived.data?.subjects_all_history || []),
              ...(rSent.data?.subjects_all_history || []),
            ]),
          ),
        );
      } else {
        const res = await api.get(CORR_URL, {
          params: {
            action: "fetch",
            type: typeTerm,
            ...(dateTerm ? { start: dateTerm } : {}),
            user: userTerm,
          },
        });
        const d = res.data || {};
        setList(d.list || []);
        setSubjectsMine(d.subjects_my_history || []);
        setSubjectsAll(d.subjects_all_history || []);
      }
    } catch (e) {
      console.error("fetch error", e);
      Alert.alert("ผิดพลาด", "โหลดรายการไม่สำเร็จ");
    }
  };

  const runFetch = async (opts?: {
    search?: string;
    date?: string;
    type?: BookType;
    user?: string;
  }) => {
    setLoading(true);
    await fetchList(opts);
    setLoading(false);
  };

  const fetchCompanies = async () => {
    try {
      const res = await api.get(CORR_URL, {
        params: { action: "get_companies" },
      });
      setCompanies(
        Array.isArray(res.data) ? res.data : res.data?.companies || [],
      );
    } catch {}
  };

  const loadAll = async () => {
    setLoading(true);
    const name = await loadUser();
    await Promise.all([fetchList({ user: name }), fetchCompanies()]);
    setLoading(false);
  };

  useFocusEffect(
    useCallback(() => {
      loadAll();
    }, [bookType]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchList();
    setRefreshing(false);
  };

  const applyFilter = () => runFetch();

  // เคลียร์ช่องค้นหา -> กลับไปโหมดแยกตามแท็บทันที (ไม่ต้องรอกด submit)
  const onSearchChange = (t: string) => {
    setSearch(t);
    if (t.trim() === "" && search.trim() !== "") {
      runFetch({ search: "" });
    }
  };

  // ---------- Form open ----------
  const openNew = () => {
    setForm(emptyForm(fullname));
    setFormOpen(true);
  };

  const openEdit = async (item: any) => {
    try {
      const res = await api.get(CORR_URL, {
        params: { action: "get_single", id: item.id },
      });
      const r = res.data?.result;
      if (!r) return Alert.alert("ไม่พบข้อมูล", res.data?.message || "");
      setBookType(r.book_type || bookType);
      setForm({
        id: r.id,
        reg_no: r.reg_no || "",
        book_date: r.book_date || todayISO(),
        doc_date: r.doc_date || "",
        ref_no: r.ref_no || "",
        sender: r.sender || "",
        company: r.company || "",
        internal_staff: r.internal_staff || fullname,
        subject: r.subject || "",
        note: r.note || "",
      });
      setFormOpen(true);
    } catch (e: any) {
      Alert.alert("ผิดพลาด", e.message || "โหลดข้อมูลไม่สำเร็จ");
    }
  };

  // ---------- Save ----------
  const save = async () => {
    if (!form.subject.trim())
      return Alert.alert("ข้อมูลไม่ครบ", "กรุณาระบุเรื่อง / รายละเอียด");
    if (!form.book_date) return Alert.alert("ข้อมูลไม่ครบ", "กรุณาระบุวันที่");
    if (labels.internalReq && !form.internal_staff.trim())
      return Alert.alert("ข้อมูลไม่ครบ", `กรุณาระบุ "${labels.internal}"`);

    setSaving(true);
    try {
      const fd = new FormData();
      if (form.id) fd.append("id", String(form.id));
      fd.append("book_type", bookType);
      fd.append("reg_no", form.reg_no.trim());
      fd.append("book_date", form.book_date);
      fd.append("ref_no", form.ref_no.trim());
      fd.append("doc_date", form.doc_date);
      fd.append("sender", form.sender.trim());
      fd.append("company", form.company.trim());
      fd.append("internal_staff", form.internal_staff.trim());
      fd.append("subject", form.subject.trim());
      fd.append("note", form.note.trim());
      fd.append("creator", fullname);

      const res = await api.post(`${CORR_URL}?action=save`, fd, {
        headers: {
          "Content-Type": "multipart/form-data",
          Accept: "application/json",
        },
      });
      const data = res.data;
      if (data?.status === "success" || data?.success) {
        setFormOpen(false);
        await fetchList();
      } else {
        Alert.alert("บันทึกไม่สำเร็จ", data?.message || "");
      }
    } catch (e: any) {
      Alert.alert("ผิดพลาด", e.message || "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = (item: any) => {
    Alert.alert("ลบรายการ", `ต้องการลบ "${item.subject || "-"}" ?`, [
      { text: "ยกเลิก", style: "cancel" },
      {
        text: "ลบ",
        style: "destructive",
        onPress: async () => {
          try {
            const fd = new FormData();
            fd.append("id", String(item.id));
            const res = await api.post(`${CORR_URL}?action=delete`, fd, {
              headers: {
                "Content-Type": "multipart/form-data",
                Accept: "application/json",
              },
            });
            if (res.data?.status === "success" || res.data?.success)
              await fetchList();
            else Alert.alert("ลบไม่สำเร็จ", res.data?.message || "");
          } catch (e: any) {
            Alert.alert("ผิดพลาด", e.message || "ลบไม่สำเร็จ");
          }
        },
      },
    ]);
  };

  // subject autocomplete: my history ก่อน, ตามด้วย all (ไม่ซ้ำ)
  const subjectSuggestions = useMemo(() => {
    const q = form.subject.trim().toLowerCase();
    if (!q) return [];
    const merged = [
      ...subjectsMine,
      ...subjectsAll.filter((x) => !subjectsMine.includes(x)),
    ];
    return merged
      .filter((x) => x && x.toLowerCase().includes(q) && x.toLowerCase() !== q)
      .slice(0, 6);
  }, [form.subject, subjectsMine, subjectsAll]);

  const companySuggestions = useMemo(() => {
    const q = form.company.trim().toLowerCase();
    if (!q) return companies.slice(0, 6);
    return companies
      .filter(
        (x) =>
          x.name &&
          x.name.toLowerCase().includes(q) &&
          x.name.toLowerCase() !== q,
      )
      .slice(0, 6);
  }, [form.company, companies]);

  // ---------- Pagination (50 รายการต่อหน้า) ----------
  const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const pagedList = useMemo(
    () => list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [list, page],
  );

  // รีเซ็ตกลับหน้า 1 เมื่อสลับแท็บ หรือข้อมูลโหลดใหม่ / clamp ถ้าหน้าปัจจุบันเกินช่วง
  useEffect(() => {
    setPage(1);
  }, [bookType, list]);
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  return (
    <View style={[s.container, { backgroundColor: c.bg }]}>
      {/* Type tabs */}
      <View
        style={[
          s.typeTabWrap,
          { backgroundColor: c.card, borderBottomColor: c.border },
        ]}
      >
        {(["received", "sent"] as BookType[]).map((t) => (
          <TouchableOpacity
            key={t}
            style={[
              s.typeTab,
              bookType === t && {
                backgroundColor: t === "received" ? c.received : c.sent,
              },
            ]}
            onPress={() => setBookType(t)}
          >
            <Ionicons
              name={t === "received" ? "download" : "send"}
              size={16}
              color={bookType === t ? "#fff" : c.textSecondary}
            />
            <Text
              style={{
                color: bookType === t ? "#fff" : c.textSecondary,
                fontWeight: "800",
                fontSize: 13,
              }}
            >
              {t === "received" ? "ทะเบียนรับ" : "ทะเบียนส่ง"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Search + date */}
      <View style={s.filterRow}>
        <View
          style={[
            s.searchBox,
            { backgroundColor: c.card, borderColor: c.border },
          ]}
        >
          <Ionicons name="search" size={16} color={c.textSecondary} />
          <TextInput
            value={search}
            onChangeText={onSearchChange}
            onSubmitEditing={applyFilter}
            placeholder="ค้นหาเรื่อง / เลขทะเบียน (ค้นได้ทั้ง 2 แท็บ)"
            placeholderTextColor={c.textSecondary}
            style={[s.searchInput, { color: c.text }]}
          />
          {search ? (
            <TouchableOpacity onPress={() => onSearchChange("")}>
              <Ionicons name="close-circle" size={16} color={c.textSecondary} />
            </TouchableOpacity>
          ) : null}
        </View>
        <TouchableOpacity
          style={[
            s.dateBtn,
            { backgroundColor: c.card, borderColor: c.border },
          ]}
          onPress={() => setShowListDate(true)}
        >
          <Ionicons name="calendar-outline" size={16} color={c.primary} />
          <Text style={{ color: c.text, fontSize: 12 }}>
            {filterDate || "วันที่"}
          </Text>
        </TouchableOpacity>
        {filterDate ? (
          <TouchableOpacity
            onPress={() => {
              setFilterDate("");
              runFetch({ date: "" });
            }}
          >
            <Ionicons name="close-circle" size={20} color={c.danger} />
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          style={[s.goBtn, { backgroundColor: c.primary }]}
          onPress={applyFilter}
        >
          <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>
            ค้นหา
          </Text>
        </TouchableOpacity>
      </View>

      {/* แจ้งเตือนว่ากำลังค้นหาข้ามแท็บ */}
      {isSearching && (
        <View style={s.crossTabNote}>
          <Ionicons name="information-circle" size={14} color={c.primary} />
          <Text style={{ color: c.primary, fontSize: 11, fontWeight: "700" }}>
            ผลค้นหานี้แสดงทั้งทะเบียนรับและทะเบียนส่ง
          </Text>
        </View>
      )}

      {loading ? (
        <ActivityIndicator
          size="large"
          color={c.primary}
          style={{ marginTop: 40 }}
        />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 14, paddingBottom: 90 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={c.primary}
            />
          }
        >
          {list.length === 0 ? (
            <Text
              style={{
                color: c.textSecondary,
                textAlign: "center",
                marginTop: 30,
              }}
            >
              {isSearching ? "ไม่พบรายการที่ค้นหา" : "ยังไม่มีรายการ"}
            </Text>
          ) : (
            <>
              {/* แถบสรุปจำนวน/หน้า */}
              <View style={s.pageInfoRow}>
                <Text style={{ color: c.textSecondary, fontSize: 12 }}>
                  ทั้งหมด {list.length} รายการ · แสดง{" "}
                  {(page - 1) * PAGE_SIZE + 1}-
                  {Math.min(page * PAGE_SIZE, list.length)}
                </Text>
                <Text
                  style={{
                    color: c.textSecondary,
                    fontSize: 12,
                    fontWeight: "700",
                  }}
                >
                  หน้า {page}/{totalPages}
                </Text>
              </View>

              {pagedList.map((item) => {
                const rowType: BookType =
                  item.book_type === "sent" ? "sent" : "received";
                const rowColor = rowType === "received" ? c.received : c.sent;
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[
                      s.listRow,
                      { backgroundColor: c.card, borderLeftColor: rowColor },
                    ]}
                    activeOpacity={0.7}
                    onPress={() => openEdit(item)}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 8,
                        marginBottom: 3,
                      }}
                    >
                      {isSearching && (
                        <View
                          style={[
                            s.typeBadge,
                            { backgroundColor: rowColor + "22" },
                          ]}
                        >
                          <Text
                            style={{
                              color: rowColor,
                              fontSize: 10,
                              fontWeight: "800",
                            }}
                          >
                            {rowType === "received" ? "รับ" : "ส่ง"}
                          </Text>
                        </View>
                      )}
                      {!!item.reg_no && (
                        <Text
                          style={{
                            color: c.textSecondary,
                            fontSize: 12,
                            fontWeight: "700",
                          }}
                        >
                          #{item.reg_no}
                        </Text>
                      )}
                      <View style={{ flex: 1 }} />
                      <Text style={{ color: c.textSecondary, fontSize: 11 }}>
                        {item.book_date_thai || item.book_date}
                      </Text>
                    </View>
                    <Text
                      style={{ color: c.text, fontSize: 14, fontWeight: "700" }}
                      numberOfLines={2}
                    >
                      {item.subject || "-"}
                    </Text>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 8,
                        marginTop: 4,
                      }}
                    >
                      {!!item.company && (
                        <Text
                          style={{
                            color: c.textSecondary,
                            fontSize: 12,
                            flex: 1,
                          }}
                          numberOfLines={1}
                        >
                          🏢 {item.company}
                        </Text>
                      )}
                      {!!item.file_count && item.file_count > 0 && (
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 2,
                          }}
                        >
                          <Ionicons
                            name="attach"
                            size={13}
                            color={c.textSecondary}
                          />
                          <Text
                            style={{ color: c.textSecondary, fontSize: 11 }}
                          >
                            {item.file_count}
                          </Text>
                        </View>
                      )}
                      <TouchableOpacity
                        onPress={() => confirmDelete(item)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons
                          name="trash-outline"
                          size={16}
                          color={c.danger}
                        />
                      </TouchableOpacity>
                    </View>
                  </TouchableOpacity>
                );
              })}

              {/* ตัวควบคุมเปลี่ยนหน้า */}
              {totalPages > 1 && (
                <View style={s.pagerRow}>
                  <TouchableOpacity
                    style={[
                      s.pagerBtn,
                      { borderColor: c.border, opacity: page <= 1 ? 0.4 : 1 },
                    ]}
                    disabled={page <= 1}
                    onPress={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    <Ionicons name="chevron-back" size={16} color={c.primary} />
                    <Text
                      style={{
                        color: c.primary,
                        fontWeight: "700",
                        fontSize: 13,
                      }}
                    >
                      ก่อนหน้า
                    </Text>
                  </TouchableOpacity>

                  <Text
                    style={{ color: c.text, fontWeight: "800", fontSize: 14 }}
                  >
                    {page} / {totalPages}
                  </Text>

                  <TouchableOpacity
                    style={[
                      s.pagerBtn,
                      {
                        borderColor: c.border,
                        opacity: page >= totalPages ? 0.4 : 1,
                      },
                    ]}
                    disabled={page >= totalPages}
                    onPress={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    <Text
                      style={{
                        color: c.primary,
                        fontWeight: "700",
                        fontSize: 13,
                      }}
                    >
                      ถัดไป
                    </Text>
                    <Ionicons
                      name="chevron-forward"
                      size={16}
                      color={c.primary}
                    />
                  </TouchableOpacity>
                </View>
              )}
            </>
          )}
        </ScrollView>
      )}

      {/* FAB เพิ่มรายการ */}
      <TouchableOpacity
        style={[
          s.fab,
          { backgroundColor: bookType === "received" ? c.received : c.sent },
        ]}
        onPress={openNew}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      {showListDate && (
        <DateTimePicker
          value={filterDate ? new Date(filterDate) : new Date()}
          mode="date"
          onChange={(e, d) => {
            setShowListDate(false);
            if (e.type === "set" && d) {
              const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
              setFilterDate(iso);
              runFetch({ date: iso });
            }
          }}
        />
      )}

      {/* ---------- Form Modal ---------- */}
      <Modal
        visible={formOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setFormOpen(false)}
      >
        <View style={[s.modalOverlay, { backgroundColor: c.overlay }]}>
          <View style={[s.sheet, { backgroundColor: c.card }]}>
            <View style={[s.sheetHead, { borderBottomColor: c.border }]}>
              <Text style={[s.sheetTitle, { color: c.text }]}>
                {form.id ? "แก้ไข" : "เพิ่ม"}
                {bookType === "received" ? "ทะเบียนรับ" : "ทะเบียนส่ง"}
              </Text>
              <TouchableOpacity onPress={() => setFormOpen(false)}>
                <Ionicons name="close" size={26} color={c.textSecondary} />
              </TouchableOpacity>
            </View>

            <KeyboardAvoidingView
              behavior={Platform.OS === "ios" ? "padding" : undefined}
              style={{ flex: 1 }}
            >
              <ScrollView
                style={{ padding: 16 }}
                keyboardShouldPersistTaps="handled"
              >
                {/* type switch ในฟอร์ม (เฉพาะตอนเพิ่มใหม่) */}
                {!form.id && (
                  <View style={s.formTypeRow}>
                    {(["received", "sent"] as BookType[]).map((t) => (
                      <TouchableOpacity
                        key={t}
                        style={[
                          s.formTypeBtn,
                          { borderColor: c.border },
                          bookType === t && {
                            backgroundColor:
                              (t === "received" ? c.received : c.sent) + "22",
                            borderColor: t === "received" ? c.received : c.sent,
                          },
                        ]}
                        onPress={() => setBookType(t)}
                      >
                        <Text
                          style={{
                            color:
                              bookType === t
                                ? t === "received"
                                  ? c.received
                                  : c.sent
                                : c.textSecondary,
                            fontWeight: "700",
                            fontSize: 12,
                          }}
                        >
                          {t === "received" ? "📥 รับ" : "📤 ส่ง"}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                <View style={{ flexDirection: "row", gap: 8 }}>
                  <Field label="เลขทะเบียน" c={c} s={s} style={{ flex: 1 }}>
                    <TextInput
                      value={form.reg_no}
                      onChangeText={(t) =>
                        setForm((f) => ({ ...f, reg_no: t }))
                      }
                      placeholder="เลขทะเบียน"
                      placeholderTextColor={c.textSecondary}
                      style={[
                        s.input,
                        {
                          color: c.text,
                          borderColor: c.border,
                          backgroundColor: c.bgSecondary,
                        },
                      ]}
                    />
                  </Field>
                  <Field label="วันที่ *" c={c} s={s} style={{ flex: 1 }}>
                    <TouchableOpacity
                      style={[
                        s.input,
                        s.dateInput,
                        {
                          borderColor: c.border,
                          backgroundColor: c.bgSecondary,
                        },
                      ]}
                      onPress={() => setShowBookDate(true)}
                    >
                      <Ionicons
                        name="calendar-outline"
                        size={15}
                        color={c.primary}
                      />
                      <Text style={{ color: c.text }}>{form.book_date}</Text>
                    </TouchableOpacity>
                  </Field>
                </View>

                <Field label={labels.sender} c={c} s={s}>
                  <TextInput
                    value={form.sender}
                    onChangeText={(t) => setForm((f) => ({ ...f, sender: t }))}
                    placeholder={labels.sender}
                    placeholderTextColor={c.textSecondary}
                    style={[
                      s.input,
                      {
                        color: c.text,
                        borderColor: c.border,
                        backgroundColor: c.bgSecondary,
                      },
                    ]}
                  />
                </Field>

                <Field
                  label={`${labels.internal}${labels.internalReq ? " *" : ""}`}
                  c={c}
                  s={s}
                >
                  <TextInput
                    value={form.internal_staff}
                    onChangeText={(t) =>
                      setForm((f) => ({ ...f, internal_staff: t }))
                    }
                    placeholder={labels.internal}
                    placeholderTextColor={c.textSecondary}
                    style={[
                      s.input,
                      {
                        color: c.text,
                        borderColor: c.border,
                        backgroundColor: c.bgSecondary,
                      },
                    ]}
                  />
                </Field>

                {/* company + autocomplete */}
                <View
                  style={{ marginBottom: 12, position: "relative", zIndex: 6 }}
                >
                  <Text style={[s.fieldLabel, { color: c.textSecondary }]}>
                    หน่วยงาน / บริษัท
                  </Text>
                  <TextInput
                    value={form.company}
                    onChangeText={(t) => setForm((f) => ({ ...f, company: t }))}
                    onFocus={() => setCompFocus(true)}
                    onBlur={() => setTimeout(() => setCompFocus(false), 150)}
                    placeholder="ชื่อหน่วยงาน / บริษัท"
                    placeholderTextColor={c.textSecondary}
                    style={[
                      s.input,
                      {
                        color: c.text,
                        borderColor: c.border,
                        backgroundColor: c.bgSecondary,
                      },
                    ]}
                  />
                  {compFocus && companySuggestions.length > 0 && (
                    <View
                      style={[
                        s.suggestBox,
                        { backgroundColor: c.card, borderColor: c.border },
                      ]}
                    >
                      {companySuggestions.map((co, i) => (
                        <TouchableOpacity
                          key={i}
                          style={s.suggestItem}
                          onPress={() =>
                            setForm((f) => ({ ...f, company: co.name }))
                          }
                        >
                          <Text style={{ color: c.text, fontSize: 14 }}>
                            {co.name}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>

                {/* subject + autocomplete */}
                <View
                  style={{ marginBottom: 12, position: "relative", zIndex: 5 }}
                >
                  <Text style={[s.fieldLabel, { color: c.textSecondary }]}>
                    เรื่อง / รายละเอียด *
                  </Text>
                  <TextInput
                    value={form.subject}
                    onChangeText={(t) => setForm((f) => ({ ...f, subject: t }))}
                    onFocus={() => setSubjFocus(true)}
                    onBlur={() => setTimeout(() => setSubjFocus(false), 150)}
                    placeholder="เรื่อง"
                    placeholderTextColor={c.textSecondary}
                    multiline
                    style={[
                      s.input,
                      {
                        minHeight: 54,
                        textAlignVertical: "top",
                        color: c.text,
                        borderColor: c.border,
                        backgroundColor: c.bgSecondary,
                      },
                    ]}
                  />
                  {subjFocus && subjectSuggestions.length > 0 && (
                    <View
                      style={[
                        s.suggestBox,
                        {
                          backgroundColor: c.card,
                          borderColor: c.border,
                          top: 78,
                        },
                      ]}
                    >
                      {subjectSuggestions.map((sub, i) => (
                        <TouchableOpacity
                          key={i}
                          style={s.suggestItem}
                          onPress={() =>
                            setForm((f) => ({ ...f, subject: sub }))
                          }
                        >
                          <Text
                            style={{ color: c.text, fontSize: 14 }}
                            numberOfLines={1}
                          >
                            {sub}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>

                <View style={{ flexDirection: "row", gap: 8 }}>
                  <Field label="วันที่เอกสาร" c={c} s={s} style={{ flex: 1 }}>
                    <TouchableOpacity
                      style={[
                        s.input,
                        s.dateInput,
                        {
                          borderColor: c.border,
                          backgroundColor: c.bgSecondary,
                        },
                      ]}
                      onPress={() => setShowDocDate(true)}
                    >
                      <Ionicons
                        name="calendar-outline"
                        size={15}
                        color={c.primary}
                      />
                      <Text
                        style={{
                          color: form.doc_date ? c.text : c.textSecondary,
                        }}
                      >
                        {form.doc_date || "-"}
                      </Text>
                    </TouchableOpacity>
                  </Field>
                </View>

                <Field label="หมายเหตุ" c={c} s={s}>
                  <TextInput
                    value={form.note}
                    onChangeText={(t) => setForm((f) => ({ ...f, note: t }))}
                    placeholder="หมายเหตุ"
                    placeholderTextColor={c.textSecondary}
                    multiline
                    style={[
                      s.input,
                      {
                        minHeight: 48,
                        textAlignVertical: "top",
                        color: c.text,
                        borderColor: c.border,
                        backgroundColor: c.bgSecondary,
                      },
                    ]}
                  />
                </Field>

                <TouchableOpacity
                  style={[s.saveBtn, { backgroundColor: c.primary }]}
                  onPress={save}
                  disabled={saving}
                >
                  {saving ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="save-outline" size={20} color="#fff" />
                      <Text
                        style={{
                          color: "#fff",
                          fontWeight: "800",
                          fontSize: 16,
                        }}
                      >
                        บันทึก
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
                <View style={{ height: 40 }} />
              </ScrollView>
            </KeyboardAvoidingView>
          </View>
        </View>

        {showBookDate && (
          <DateTimePicker
            value={form.book_date ? new Date(form.book_date) : new Date()}
            mode="date"
            onChange={(e, d) => {
              setShowBookDate(false);
              if (e.type === "set" && d) {
                const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                setForm((f) => ({ ...f, book_date: iso }));
              }
            }}
          />
        )}
        {showDocDate && (
          <DateTimePicker
            value={form.doc_date ? new Date(form.doc_date) : new Date()}
            mode="date"
            onChange={(e, d) => {
              setShowDocDate(false);
              if (e.type === "set" && d) {
                const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                setForm((f) => ({ ...f, doc_date: iso }));
              }
            }}
          />
        )}
      </Modal>
    </View>
  );
}

function Field({ label, children, c, s, style }: any) {
  return (
    <View style={[{ marginBottom: 12 }, style]}>
      <Text style={[s.fieldLabel, { color: c.textSecondary }]}>{label}</Text>
      {children}
    </View>
  );
}

const getStyles = (c: any) =>
  StyleSheet.create({
    container: { flex: 1 },
    typeTabWrap: {
      flexDirection: "row",
      padding: 8,
      gap: 8,
      borderBottomWidth: 1,
    },
    typeTab: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingVertical: 10,
      borderRadius: 10,
    },
    filterRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    searchBox: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 10,
      height: 40,
      borderRadius: 8,
      borderWidth: 1,
    },
    searchInput: { flex: 1, fontSize: 13, padding: 0 },
    dateBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 10,
      height: 40,
      borderRadius: 8,
      borderWidth: 1,
    },
    goBtn: {
      paddingHorizontal: 14,
      height: 40,
      borderRadius: 8,
      justifyContent: "center",
      alignItems: "center",
    },
    crossTabNote: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 14,
      marginBottom: 8,
    },
    pageInfoRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 8,
      paddingHorizontal: 2,
    },
    pagerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: 4,
      marginBottom: 10,
    },
    pagerBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 14,
      paddingVertical: 9,
      borderRadius: 10,
      borderWidth: 1,
    },
    typeBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
    listRow: {
      borderRadius: 12,
      padding: 12,
      marginBottom: 10,
      borderLeftWidth: 4,
      elevation: 1,
    },
    fab: {
      position: "absolute",
      right: 20,
      bottom: 24,
      width: 56,
      height: 56,
      borderRadius: 28,
      justifyContent: "center",
      alignItems: "center",
      elevation: 6,
      shadowColor: "#000",
      shadowOpacity: 0.3,
      shadowOffset: { width: 0, height: 4 },
      shadowRadius: 6,
    },
    // modal / form
    modalOverlay: { flex: 1, justifyContent: "flex-end" },
    sheet: { height: "92%", borderTopLeftRadius: 20, borderTopRightRadius: 20 },
    sheetHead: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      padding: 16,
      borderBottomWidth: 1,
    },
    sheetTitle: { fontSize: 16, fontWeight: "800" },
    formTypeRow: { flexDirection: "row", gap: 8, marginBottom: 14 },
    formTypeBtn: {
      flex: 1,
      paddingVertical: 9,
      borderRadius: 10,
      borderWidth: 1,
      alignItems: "center",
    },
    fieldLabel: { fontSize: 12, fontWeight: "700", marginBottom: 6 },
    input: {
      borderWidth: 1,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 14,
    },
    dateInput: { flexDirection: "row", alignItems: "center", gap: 8 },
    suggestBox: {
      position: "absolute",
      top: 72,
      left: 0,
      right: 0,
      borderWidth: 1,
      borderRadius: 10,
      maxHeight: 220,
      elevation: 6,
      shadowColor: "#000",
      shadowOpacity: 0.15,
      shadowOffset: { width: 0, height: 4 },
      shadowRadius: 6,
      zIndex: 30,
    },
    suggestItem: {
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    saveBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingVertical: 14,
      borderRadius: 12,
      marginTop: 10,
    },
  });
