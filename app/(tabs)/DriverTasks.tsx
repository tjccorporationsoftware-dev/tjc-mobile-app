import { useFocusEffect, useRouter } from "expo-router";
import { Calendar, ChevronRight, FileText, Truck } from "lucide-react-native";
import React, { useCallback, useRef, useState } from "react";
import {
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
// 🌟 1. เพิ่มการ Import AsyncStorage เพื่อดึงข้อมูล User ที่ล็อกอินไว้
import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_BASE } from "../../constants/config";

export default function DriverTasks() {
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<
    "pending" | "completed" | "all"
  >("pending");
  const [dropdownVisible, setDropdownVisible] = useState(false);
  // 🌟 1. เพิ่ม State สำหรับตัวกรอง คนขับ และ คนรถ
  const [driverFilter, setDriverFilter] = useState("");
  const [helperFilter, setHelperFilter] = useState("");
  const [driverList, setDriverList] = useState<string[]>([]);
  const [helperList, setHelperList] = useState<string[]>([]);
  // 🌟 เพิ่ม State จำชื่อ User ปัจจุบัน เพื่อใช้ตอนกดล้างค่า
  const [loggedInUser, setLoggedInUser] = useState("");
  const isFirstLoad = useRef(true);
  const [driverDropdownVisible, setDriverDropdownVisible] = useState(false);
  const [helperDropdownVisible, setHelperDropdownVisible] = useState(false);
  const router = useRouter();

  const filterOptions = [
    { label: "งานที่กำลังจัดส่ง", value: "pending" },
    { label: "งานที่เสร็จสิ้นแล้ว", value: "completed" },
    { label: "ดูงานทั้งหมด", value: "all" },
  ];

  const fetchTasks = async () => {
    setLoading(true);
    try {
      const userJson = await AsyncStorage.getItem("user");
      let fullname = "";
      let role = "";

      if (userJson) {
        const user = JSON.parse(userJson);
        fullname = (user.fullname || user.name || "").trim();
        role = user.role || "staff";
        setLoggedInUser(fullname); // 🌟 จำชื่อไว้
      }

      const url = `${API_BASE}/api_mobile.php?action=get_driver_tasks&status=${statusFilter}&fullname=${encodeURIComponent(fullname)}&role=${encodeURIComponent(role)}`;

      const response = await fetch(url);
      const json = await response.json();
      const fetchedTasks = json.data || [];

      // 🌟 2. แยกรายชื่อคนขับและคนรถจากข้อมูลที่โหลดมา (เลียนแบบเว็บ)
      let dList: string[] = [];
      let hList: string[] = [];
      fetchedTasks.forEach((t: any) => {
        const str = t.sender_name || "";
        const dMatch = str.match(/คนขับ:\s*([^|]+)/);
        if (dMatch && dMatch[1]) {
          const name = dMatch[1].trim();
          if (!dList.includes(name)) dList.push(name);
        }
        const hMatch = str.match(/คนรถ:\s*([^|]+)/);
        if (hMatch && hMatch[1]) {
          const name = hMatch[1].trim();
          if (!hList.includes(name)) hList.push(name);
        }
      });

      setDriverList(dList.sort());
      setHelperList(hList.sort());

      // 🌟 3. เลือกชื่อคนขับ/คนรถอัตโนมัติ (ทำครั้งแรกที่โหลดเจอรายชื่อ)
      if (isFirstLoad.current && fullname) {
        if (dList.length > 0 || hList.length > 0) {
          const cleanFullname = fullname.replace(/\s+/g, '').toLowerCase();

          const matchedDriver = dList.find((name) => {
            const cleanName = name.replace(/\s+/g, '').toLowerCase();
            return cleanFullname.includes(cleanName) || cleanName.includes(cleanFullname);
          });

          const matchedHelper = hList.find((name) => {
            const cleanName = name.replace(/\s+/g, '').toLowerCase();
            return cleanFullname.includes(cleanName) || cleanName.includes(cleanFullname);
          });

          if (matchedDriver) {
            setDriverFilter(matchedDriver);
            isFirstLoad.current = false;
          } else if (matchedHelper) {
            setHelperFilter(matchedHelper);
            isFirstLoad.current = false;
          } else {
            // ถ้าดึงข้อมูลมาแล้วแต่ไม่เจอชื่อเลย ให้ถือว่าเช็คเสร็จแล้ว
            if (fetchedTasks.length > 0) {
              isFirstLoad.current = false;
            }
          }
        }
      }

      
      setTasks(fetchedTasks);
    } catch (error) {
      console.error("Fetch Tasks Error:", error);
    } finally {
      setLoading(false);
    }
  };

  // 🌟 4. ฟังก์ชันกรองข้อมูลแบบ Local (ปรับปรุงให้กรองแม่นยำขึ้น)
  const filteredTasks = tasks.filter((task) => {
    const str: string = task.sender_name || "";
    const segments = str.split("|"); // แยกส่วน "คนขับ" กับ "คนรถ" ออกจากกัน

    if (driverFilter) {
      // หาเฉพาะส่วนที่มีคำว่า "คนขับ" แล้วเช็คว่ามีชื่อที่เลือกอยู่ไหม
      const driverPart = segments.find((s: string) => s.includes("คนขับ:")) || "";
      if (!driverPart.includes(driverFilter)) return false;
    }

    if (helperFilter) {
      // หาเฉพาะส่วนที่มีคำว่า "คนรถ" แล้วเช็คว่ามีชื่อที่เลือกอยู่ไหม
      const helperPart = segments.find((s: string) => s.includes("คนรถ:")) || "";
      if (!helperPart.includes(helperFilter)) return false;
    }

    return true;
  });

  useFocusEffect(
    useCallback(() => {
      fetchTasks();
    }, [statusFilter]),
  );

  const renderItem = ({ item }: { item: any }) => {
    const isCompleted = parseInt(item.pending_items) === 0;

    return (
      <TouchableOpacity
        style={[
          styles.card,
          { borderLeftColor: isCompleted ? "#10b981" : "#f59e0b" },
        ]}
        onPress={() =>
          router.push({
            pathname: "/DriverConfirmItems" as any,
            params: { do_no: item.delivery_no },
          })
        }
      >
        <View style={styles.cardHeader}>
          <View style={styles.doBadge}>
            <FileText size={14} color="#1e3a8a" />
            <Text style={styles.doText}>
              {item.delivery_no.split("-")[1] || item.delivery_no}
            </Text>
          </View>
          <Text
            style={[
              styles.statusText,
              { color: isCompleted ? "#10b981" : "#d97706" },
            ]}
          >
            {isCompleted ? "ส่งสำเร็จแล้ว" : "กำลังจัดส่ง"}
          </Text>
        </View>

        <View style={styles.cardBody}>
          <View style={styles.infoRow}>
            <Truck size={16} color="#64748b" />
            <Text style={styles.infoText} numberOfLines={1}>
              {item.sender_name}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Calendar size={16} color="#64748b" />
            <Text style={styles.infoText}>{item.delivery_date}</Text>
          </View>
          <Text style={styles.qtyText}>
            รวม {item.total_items} รายการ ({item.total_qty} ชิ้น)
          </Text>
        </View>
        <ChevronRight size={20} color="#cbd5e1" style={styles.chevron} />
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.dropdownWrapper}>
        <TouchableOpacity
          style={styles.dropdownButton}
          activeOpacity={0.8}
          onPress={() => {
            setDropdownVisible(!dropdownVisible);
            setDriverDropdownVisible(false);
            setHelperDropdownVisible(false);
          }}
        >
          <Text style={styles.dropdownButtonText}>
            {filterOptions.find((opt) => opt.value === statusFilter)?.label}
          </Text>
          <ChevronRight
            size={20}
            color="#64748b"
            style={{
              transform: [{ rotate: dropdownVisible ? "270deg" : "90deg" }],
            }}
          />
        </TouchableOpacity>

        {dropdownVisible && (
          <View style={styles.dropdownList}>
            {filterOptions.map((option) => (
              <TouchableOpacity
                key={option.value}
                style={styles.dropdownOption}
                onPress={() => {
                  setStatusFilter(option.value as any);
                  setDropdownVisible(false);
                }}
              >
                <Text
                  style={[
                    styles.dropdownOptionText,
                    statusFilter === option.value &&
                    styles.dropdownOptionTextActive,
                  ]}
                >
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {/* 🌟 5. เพิ่ม UI ตัวกรอง คนขับ และ คนรถ (เรียงต่อกันแนวนอน) */}
      <View style={styles.secondaryFilterContainer}>
        {/* 🚚 Dropdown คนขับ */}
        <View
          style={[
            styles.dropdownWrapper,
            { flex: 1, marginHorizontal: 0, marginTop: 0, zIndex: 9 },
          ]}
        >
          <TouchableOpacity
            style={styles.dropdownButton}
            activeOpacity={0.8}
            onPress={() => {
              setDriverDropdownVisible(!driverDropdownVisible);
              setHelperDropdownVisible(false);
              setDropdownVisible(false);
            }}
          >
            <Text style={styles.dropdownButtonText} numberOfLines={1}>
              {driverFilter ? driverFilter : "-- 🚚 คนขับ (ทั้งหมด) --"}
            </Text>
            <ChevronRight
              size={16}
              color="#64748b"
              style={{
                transform: [
                  { rotate: driverDropdownVisible ? "270deg" : "90deg" },
                ],
              }}
            />
          </TouchableOpacity>

          {driverDropdownVisible && (
            <ScrollView style={[styles.dropdownList, { maxHeight: 300 }]} nestedScrollEnabled={true}>
              <TouchableOpacity
                style={styles.dropdownOption}
                onPress={() => {
                  setDriverFilter("");
                  setDriverDropdownVisible(false);
                }}
              >
                <Text style={styles.dropdownOptionText}>-- 🚚 ทั้งหมด --</Text>
              </TouchableOpacity>
              {driverList.map((d) => (
                <TouchableOpacity
                  key={d}
                  style={styles.dropdownOption}
                  onPress={() => {
                    setDriverFilter(d);
                    setDriverDropdownVisible(false);
                  }}
                >
                  <Text
                    style={[
                      styles.dropdownOptionText,
                      driverFilter === d && styles.dropdownOptionTextActive,
                    ]}
                    numberOfLines={1}
                  >
                    {d}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>

        {/* 👷 Dropdown คนรถ */}
        <View
          style={[
            styles.dropdownWrapper,
            { flex: 1, marginHorizontal: 0, marginTop: 0, zIndex: 8 },
          ]}
        >
          <TouchableOpacity
            style={styles.dropdownButton}
            activeOpacity={0.8}
            onPress={() => {
              setHelperDropdownVisible(!helperDropdownVisible);
              setDriverDropdownVisible(false);
              setDropdownVisible(false);
            }}
          >
            <Text style={styles.dropdownButtonText} numberOfLines={1}>
              {helperFilter ? helperFilter : "-- 👷 คนรถ (ทั้งหมด) --"}
            </Text>
            <ChevronRight
              size={16}
              color="#64748b"
              style={{
                transform: [
                  { rotate: helperDropdownVisible ? "270deg" : "90deg" },
                ],
              }}
            />
          </TouchableOpacity>

          {helperDropdownVisible && (
            <ScrollView style={[styles.dropdownList, { maxHeight: 300 }]} nestedScrollEnabled={true}>
              <TouchableOpacity
                style={styles.dropdownOption}
                onPress={() => {
                  setHelperFilter("");
                  setHelperDropdownVisible(false);
                }}
              >
                <Text style={styles.dropdownOptionText}>-- 👷 ทั้งหมด --</Text>
              </TouchableOpacity>
              {helperList.map((h) => (
                <TouchableOpacity
                  key={h}
                  style={styles.dropdownOption}
                  onPress={() => {
                    setHelperFilter(h);
                    setHelperDropdownVisible(false);
                  }}
                >
                  <Text
                    style={[
                      styles.dropdownOptionText,
                      helperFilter === h && styles.dropdownOptionTextActive,
                    ]}
                    numberOfLines={1}
                  >
                    {h}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>
      </View>

      {/* 🌟 ปุ่มล้างค่าแบบหน้าเว็บ */}
      <TouchableOpacity
        style={styles.clearFilterButton}
        onPress={() => {
          // ล้างทุกอย่างก่อน
          setDriverFilter("");
          setHelperFilter("");
          setStatusFilter("pending");

          // แล้วสั่งให้หาชื่อตัวเองใหม่ใน List ที่มีอยู่
          let myDriverName;
          let myHelperName;

          if (loggedInUser && loggedInUser.trim() !== "") {
            const cleanUser = loggedInUser.replace(/\s+/g, '').toLowerCase();
            myDriverName = driverList.find((n) => {
              const cleanN = n.replace(/\s+/g, '').toLowerCase();
              return cleanUser.includes(cleanN) || cleanN.includes(cleanUser);
            });
            myHelperName = helperList.find((n) => {
              const cleanN = n.replace(/\s+/g, '').toLowerCase();
              return cleanUser.includes(cleanN) || cleanN.includes(cleanUser);
            });
          }

          if (myDriverName) setDriverFilter(myDriverName);
          else if (myHelperName) setHelperFilter(myHelperName);
        }}
      >
        <Text style={styles.clearFilterText}>
          🔄 ล้างค่าตัวกรอง (กลับไปงานของฉัน)
        </Text>
      </TouchableOpacity>

      <FlatList
        data={filteredTasks} // 🌟 เปลี่ยนมาใช้ข้อมูลที่ถูกกรองแล้ว
        renderItem={renderItem}
        keyExtractor={(item) => item.delivery_no}
        contentContainerStyle={{ padding: 15, paddingBottom: 30 }}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={fetchTasks} />
        }
        ListEmptyComponent={
          !loading ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>
                ไม่มี
                {filterOptions.find((opt) => opt.value === statusFilter)?.label}
              </Text>
            </View>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f1f5f9" },
  dropdownWrapper: {
    position: "relative",
    zIndex: 10,
    marginHorizontal: 15,
    marginTop: 15,
    marginBottom: 5,
  },
  dropdownButton: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "white",
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#cbd5e1",
  },
  dropdownButtonText: {
    fontSize: 15,
    color: "#1e293b",
    fontWeight: "600",
  },
  dropdownList: {
    position: "absolute",
    top: 50,
    left: 0,
    right: 0,
    backgroundColor: "white",
    borderRadius: 8,
    elevation: 5,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 6,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    zIndex: 20,
  },
  dropdownOption: {
    paddingVertical: 14,
    paddingHorizontal: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  dropdownOptionText: { fontSize: 14, color: "#475569" },
  dropdownOptionTextActive: { color: "#2563eb", fontWeight: "700" },
  card: {
    backgroundColor: "white",
    borderRadius: 12,
    padding: 15,
    marginBottom: 12,
    borderLeftWidth: 5,
    elevation: 2,
    position: "relative",
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  doBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#dbeafe",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  doText: { marginLeft: 5, fontWeight: "700", color: "#1e3a8a" },
  statusText: { fontSize: 13, fontWeight: "700" },
  cardBody: { gap: 5 },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  infoText: { color: "#475569", fontSize: 13 },
  qtyText: { marginTop: 5, fontSize: 12, fontWeight: "600", color: "#3b82f6" },
  chevron: {
    position: "absolute",
    right: 10,
    top: "50%",
    transform: [{ translateY: -10 }],
  },
  emptyContainer: {
    marginTop: 50,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: { color: "#94a3b8", fontSize: 15 },
  // 🌟 6. เพิ่ม Style สำหรับตัวกรองใหม่
  secondaryFilterContainer: {
    flexDirection: "row",
    gap: 10,
    marginHorizontal: 15,
    marginTop: 10,
    marginBottom: 10,
    zIndex: 9,
  },
  clearFilterButton: {
    backgroundColor: "#fef2f2",
    borderColor: "#fca5a5",
    borderWidth: 1,
    paddingVertical: 10,
    marginHorizontal: 15,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 10,
  },
  clearFilterText: {
    color: "#ef4444",
    fontWeight: "600",
    fontSize: 14,
  },
});
