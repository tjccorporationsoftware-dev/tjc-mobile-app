import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import axios from "axios";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import MapView, { Callout, Marker, PROVIDER_GOOGLE } from "react-native-maps";
import { SafeAreaView } from "react-native-safe-area-context";
import { API_BASE, IMG_BASE_URL } from "../../constants/config";

const COLOR_PRIMARY = "#4e54c8";

export default function MapDashboardScreen() {
  const mapRef = useRef<MapView>(null);
  const [markers, setMarkers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // ✅ แก้ไข 1: ปรับ State ให้รับค่า null ได้ (เพื่อรองรับการดูทั้งหมด)
  const [startDate, setStartDate] = useState<Date | null>(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  const [endDate, setEndDate] = useState<Date | null>(
    new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0),
  );

  const [userList, setUserList] = useState<string[]>([]);
  const [selectedUser, setSelectedUser] = useState("");
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [showListModal, setShowListModal] = useState(false);

  const [isFilterVisible, setFilterVisible] = useState(true);
  const [mapType, setMapType] = useState<"standard" | "hybrid">("standard");

  const [showPicker, setShowPicker] = useState(false);
  const [pickerMode, setPickerMode] = useState<"start" | "end">("start");
  const [tempDate, setTempDate] = useState(new Date());

  // --- Helpers ---
  const formatDateForAPI = (date: Date | null) => {
    if (!date) return ""; // ✅ ถ้าเป็น null ให้ส่งค่าว่าง
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const formatDateDisplay = (date: Date | null) => {
    if (!date) return "ทั้งหมด"; // ✅ แสดงคำว่าทั้งหมด
    return date.toLocaleDateString("th-TH", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  const getPinColor = (status: string) => {
    if (status?.includes("ได้งาน") || status?.includes("สำเร็จ"))
      return "#2ecc71";
    if (status?.includes("เสนอ")) return "#3498db";
    if (status?.includes("ติดตาม") || status?.includes("รอ")) return "#f1c40f";
    if (status?.includes("ไม่ได้") || status?.includes("ยกเลิก"))
      return "#e74c3c";
    return "#95a5a6";
  };

  const getAvatarUrl = (filename: string) => {
    if (!filename) return null;
    const baseUrl = IMG_BASE_URL.endsWith("/")
      ? IMG_BASE_URL
      : IMG_BASE_URL + "/";
    return `${baseUrl}uploads/profiles/${filename}`;
  };

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const res = await axios.get(
          `${API_BASE}/api_mobile.php?action=get_users`,
        );
        if (Array.isArray(res.data)) setUserList(res.data);
      } catch (error) {
        console.error(error);
      }
    };
    fetchUsers();
    fetchMapData();
  }, []);

  useEffect(() => {
    fetchMapData();
  }, [startDate, endDate, selectedUser]);

  const fetchMapData = async () => {
    setLoading(true);
    try {
      const startStr = formatDateForAPI(startDate);
      const endStr = formatDateForAPI(endDate);

      let url = `${API_BASE}/api_mobile.php?action=get_map_data`;
      // ✅ ส่งพารามิเตอร์เฉพาะที่มีค่า (ถ้า null คือไม่ส่ง = ดูทั้งหมด)
      if (startStr) url += `&start_date=${startStr}`;
      if (endStr) url += `&end_date=${endStr}`;
      if (selectedUser) url += `&filter_name=${selectedUser}`;

      console.log("Fetching:", url);
      const res = await axios.get(url);

      if (Array.isArray(res.data)) {
        const validMarkers = res.data.filter(
          (m: any) =>
            m.lat &&
            m.lng &&
            !isNaN(parseFloat(m.lat)) &&
            parseFloat(m.lat) !== 0,
        );
        setMarkers(validMarkers);
        handleFitToMarkers(validMarkers);
      } else {
        setMarkers([]);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  // ✅ ฟังก์ชันปุ่ม "ดูทั้งหมด" (ล้างวันที่)
  const handleShowAllDates = () => {
    setStartDate(null);
    setEndDate(null);
  };

  const handleFitToMarkers = (currentMarkers = markers) => {
    if (currentMarkers.length > 0 && mapRef.current) {
      const coordinates = currentMarkers.map((m: any) => ({
        latitude: parseFloat(m.lat),
        longitude: parseFloat(m.lng),
      }));
      mapRef.current.fitToCoordinates(coordinates, {
        edgePadding: { top: 180, right: 50, bottom: 50, left: 50 },
        animated: true,
      });
    }
  };

  const handleToggleMapType = () => {
    setMapType((prev) => (prev === "standard" ? "hybrid" : "standard"));
  };

  const handleFocusItem = (item: any) => {
    setShowListModal(false);
    if (mapRef.current) {
      mapRef.current.animateToRegion(
        {
          latitude: parseFloat(item.lat),
          longitude: parseFloat(item.lng),
          latitudeDelta: 0.005,
          longitudeDelta: 0.005,
        },
        1000,
      );
    }
  };

  const openDatePicker = (mode: "start" | "end") => {
    setPickerMode(mode);
    // ถ้าเป็น null ให้เริ่มที่วันนี้
    setTempDate((mode === "start" ? startDate : endDate) || new Date());
    setShowPicker(true);
  };

  const onDateChange = (event: any, selectedDate?: Date) => {
    if (Platform.OS === "android") {
      setShowPicker(false);
      if (selectedDate) {
        if (pickerMode === "start") setStartDate(selectedDate);
        else setEndDate(selectedDate);
      }
    } else {
      if (selectedDate) setTempDate(selectedDate);
    }
  };

  const confirmDateIOS = () => {
    setShowPicker(false);
    if (pickerMode === "start") setStartDate(tempDate);
    else setEndDate(tempDate);
  };

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        provider={PROVIDER_GOOGLE}
        mapType={mapType}
        initialRegion={{
          latitude: 13.7563,
          longitude: 100.5018,
          latitudeDelta: 10,
          longitudeDelta: 10,
        }}
      >
        {markers.map((marker, index) => {
          const color = getPinColor(marker.status);
          const avatarUri = getAvatarUrl(marker.avatar);
          return (
            <Marker
              key={index}
              coordinate={{
                latitude: parseFloat(marker.lat),
                longitude: parseFloat(marker.lng),
              }}
              title={marker.reporter_name}
              description={marker.project || marker.work_result}
            >
              <View style={styles.markerContainer}>
                <View style={[styles.pinHead, { borderColor: color }]}>
                  {avatarUri ? (
                    <Image
                      source={{ uri: avatarUri }}
                      style={styles.avatarImage}
                    />
                  ) : (
                    <View
                      style={[
                        styles.placeholderAvatar,
                        { backgroundColor: color },
                      ]}
                    >
                      <Ionicons name="person" size={16} color="white" />
                    </View>
                  )}
                </View>
                <View style={[styles.pinArrow, { borderTopColor: color }]} />
              </View>

              <Callout tooltip>
                <View style={styles.calloutBubble}>
                  <View style={styles.calloutHeader}>
                    <Text style={styles.calloutTitle}>
                      {marker.reporter_name}
                    </Text>
                    <Text style={styles.calloutRole}>
                      ({marker.position || "พนักงาน"})
                    </Text>
                  </View>
                  <View style={styles.divider} />
                  <Text style={styles.rowText}>
                    🏢{" "}
                    <Text style={{ fontWeight: "bold" }}>
                      {marker.client || "ลูกค้าทั่วไป"}
                    </Text>
                  </Text>
                  <Text style={styles.rowText}>
                    📂 {marker.work_result || marker.project_name || "-"}
                  </Text>
                  <View style={styles.divider} />
                  <View style={styles.statusRow}>
                    <Text style={[styles.statusText, { color: color }]}>
                      ● {marker.status}
                    </Text>
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

      {/* Top Control Bar */}
      <SafeAreaView style={styles.topContainer} pointerEvents="box-none">
        {isFilterVisible ? (
          <View style={styles.controlCard}>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                marginBottom: 10,
              }}
            >
              <Text style={{ fontWeight: "bold", color: "#333" }}>
                ตัวกรองแผนที่
              </Text>
              <TouchableOpacity onPress={() => setFilterVisible(false)}>
                <Ionicons name="chevron-up-circle" size={24} color="#999" />
              </TouchableOpacity>
            </View>

            {/* Date Picker Row */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
                marginBottom: 10,
              }}
            >
              <TouchableOpacity
                style={styles.dateBox}
                onPress={() => openDatePicker("start")}
              >
                <Text
                  style={[styles.dateLabel, !startDate && { color: "#999" }]}
                >
                  {formatDateDisplay(startDate)}
                </Text>
                <Ionicons name="calendar" size={14} color="#666" />
              </TouchableOpacity>
              <Ionicons name="arrow-forward" size={16} color="#ccc" />
              <TouchableOpacity
                style={styles.dateBox}
                onPress={() => openDatePicker("end")}
              >
                <Text style={[styles.dateLabel, !endDate && { color: "#999" }]}>
                  {formatDateDisplay(endDate)}
                </Text>
                <Ionicons name="calendar" size={14} color="#666" />
              </TouchableOpacity>
            </View>

            {/* ✅ ปุ่มดูทั้งหมด (Clear Date) */}
            <TouchableOpacity
              onPress={handleShowAllDates}
              style={styles.clearDateBtn}
            >
              <Text
                style={{
                  color: COLOR_PRIMARY,
                  fontSize: 12,
                  fontWeight: "bold",
                }}
              >
                📅 แสดงประวัติทั้งหมด (ไม่ระบุวันที่)
              </Text>
            </TouchableOpacity>

            {/* User Selector */}
            <View style={{ zIndex: 2000 }}>
              <TouchableOpacity
                style={styles.userSelector}
                onPress={() => setShowUserDropdown(!showUserDropdown)}
              >
                <Ionicons name="person" size={16} color="#555" />
                <Text
                  style={[styles.userLabel, !selectedUser && { color: "#999" }]}
                >
                  {selectedUser || "-- พนักงานทั้งหมด --"}
                </Text>
                <Ionicons name="chevron-down" size={16} color="#999" />
              </TouchableOpacity>

              {showUserDropdown && (
                <View style={styles.dropdownList}>
                  <ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled>
                    <TouchableOpacity
                      style={styles.dropdownItem}
                      onPress={() => {
                        setSelectedUser("");
                        setShowUserDropdown(false);
                      }}
                    >
                      <Text
                        style={{ fontWeight: "bold", color: COLOR_PRIMARY }}
                      >
                        -- ทั้งหมด --
                      </Text>
                    </TouchableOpacity>
                    {userList.map((u, i) => (
                      <TouchableOpacity
                        key={i}
                        style={styles.dropdownItem}
                        onPress={() => {
                          setSelectedUser(u);
                          setShowUserDropdown(false);
                        }}
                      >
                        <Text>{u}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}
            </View>

            <Text style={styles.resultText}>
              พบ {markers.length} จุดเช็คอิน
            </Text>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.expandBtn}
            onPress={() => setFilterVisible(true)}
          >
            <Ionicons name="filter" size={16} color="white" />
            <Text
              style={{
                color: "white",
                fontWeight: "bold",
                fontSize: 12,
                marginLeft: 5,
              }}
            >
              ตัวกรอง
            </Text>
          </TouchableOpacity>
        )}
      </SafeAreaView>

      <View style={styles.rightControls}>
        <TouchableOpacity style={styles.mapBtn} onPress={handleToggleMapType}>
          <Ionicons
            name={mapType === "standard" ? "earth" : "map"}
            size={22}
            color="#333"
          />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.mapBtn}
          onPress={() => handleFitToMarkers()}
        >
          <Ionicons name="scan" size={22} color="#333" />
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={styles.fabListBtn}
        onPress={() => setShowListModal(true)}
      >
        <Ionicons name="list" size={22} color="#333" />
        <Text style={{ fontWeight: "bold", color: "#333", marginLeft: 8 }}>
          รายการ
        </Text>
      </TouchableOpacity>

      {/* List Modal */}
      <Modal
        visible={showListModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowListModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                <Ionicons name="list" size={18} /> รายการ ({markers.length})
              </Text>
              <TouchableOpacity onPress={() => setShowListModal(false)}>
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>
            {markers.length === 0 ? (
              <View style={{ padding: 40, alignItems: "center" }}>
                <Text style={{ color: "#999" }}>ไม่พบข้อมูลในช่วงเวลานี้</Text>
              </View>
            ) : (
              <FlatList
                data={markers}
                keyExtractor={(item, index) => index.toString()}
                renderItem={({ item }) => {
                  const color = getPinColor(item.status);
                  const avatarUri = getAvatarUrl(item.avatar);
                  return (
                    <TouchableOpacity
                      style={styles.jobCard}
                      onPress={() => handleFocusItem(item)}
                    >
                      <View
                        style={[styles.jobAvatarBox, { borderColor: color }]}
                      >
                        {avatarUri ? (
                          <Image
                            source={{ uri: avatarUri }}
                            style={styles.jobAvatarImg}
                          />
                        ) : (
                          <Ionicons name="person" size={20} color={color} />
                        )}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.jobName}>{item.reporter_name}</Text>
                        <Text style={styles.jobProject} numberOfLines={1}>
                          {item.project_name || item.work_result || "-"}
                        </Text>
                        <View style={styles.jobMeta}>
                          <Text style={{ fontSize: 11, color: "#888" }}>
                            {item.date}
                          </Text>
                          <View
                            style={[
                              styles.statusBadge,
                              { backgroundColor: color },
                            ]}
                          >
                            <Text style={styles.statusBadgeText}>
                              {item.status}
                            </Text>
                          </View>
                        </View>
                      </View>
                      <Ionicons
                        name="location-outline"
                        size={18}
                        color={COLOR_PRIMARY}
                      />
                    </TouchableOpacity>
                  );
                }}
              />
            )}
          </View>
        </View>
      </Modal>

      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="small" color={COLOR_PRIMARY} />
        </View>
      )}

      {showPicker &&
        (Platform.OS === "ios" ? (
          <Modal transparent animationType="fade">
            <View style={styles.centeredOverlay}>
              <View style={styles.iosPickerContainer}>
                <View style={styles.pickerHeader}>
                  <Text style={{ fontWeight: "bold", color: "#333" }}>
                    {pickerMode === "start"
                      ? "เลือกวันเริ่มต้น"
                      : "เลือกวันสิ้นสุด"}
                  </Text>
                </View>
                <DateTimePicker
                  value={tempDate}
                  mode="date"
                  display="inline"
                  locale="th-TH"
                  onChange={onDateChange}
                  themeVariant="light"
                />
                <TouchableOpacity
                  onPress={confirmDateIOS}
                  style={styles.pickerConfirmBtn}
                >
                  <Text style={{ color: COLOR_PRIMARY, fontWeight: "bold" }}>
                    ตกลง
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>
        ) : (
          <DateTimePicker
            value={(pickerMode === "start" ? startDate : endDate) || new Date()}
            mode="date"
            display="default"
            onChange={onDateChange}
          />
        ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  topContainer: {
    position: "absolute",
    top: 0,
    width: "100%",
    zIndex: 100,
    padding: 10,
  },

  controlCard: {
    backgroundColor: "white",
    borderRadius: 12,
    padding: 12,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 5,
  },
  expandBtn: {
    alignSelf: "flex-end",
    backgroundColor: COLOR_PRIMARY,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    elevation: 5,
  },

  rightControls: {
    position: "absolute",
    right: 20,
    bottom: 40,
    gap: 12,
    zIndex: 90,
  },
  mapBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "white",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },

  dateBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#f8f9fa",
    borderWidth: 1,
    borderColor: "#e9ecef",
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  dateLabel: { fontSize: 13, color: "#333", fontWeight: "600" },

  // ✅ ปุ่มล้างวันที่
  clearDateBtn: { alignItems: "center", marginBottom: 10, padding: 5 },

  userSelector: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 8,
    padding: 10,
    gap: 8,
  },
  userLabel: { flex: 1, fontSize: 14, color: "#333", fontWeight: "600" },

  dropdownList: {
    position: "absolute",
    top: 45,
    left: 0,
    right: 0,
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    maxHeight: 200,
    elevation: 10,
    zIndex: 9999,
  },
  dropdownItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },

  resultText: {
    textAlign: "center",
    fontSize: 11,
    color: "#999",
    marginTop: 10,
  },

  markerContainer: { alignItems: "center", width: 60 },
  pinHead: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 3,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "white",
    overflow: "hidden",
    elevation: 3,
  },
  avatarImage: { width: "100%", height: "100%" },
  placeholderAvatar: {
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  pinArrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 8,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    marginTop: -2,
  },

  calloutBubble: {
    backgroundColor: "white",
    padding: 10,
    borderRadius: 8,
    width: 220,
    marginBottom: 5,
  },
  calloutHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 5,
  },
  calloutTitle: { fontWeight: "bold", fontSize: 14 },
  calloutRole: { fontSize: 11, color: "#666" },
  divider: { height: 1, backgroundColor: "#eee", marginVertical: 5 },
  rowText: { fontSize: 12, color: "#444", marginBottom: 2 },
  statusRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 5,
  },
  statusText: { fontSize: 11, fontWeight: "bold" },
  dateText: { fontSize: 11, color: "#888" },
  arrowBorder: {
    alignSelf: "center",
    borderTopColor: "#ccc",
    borderWidth: 10,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    marginTop: -1,
  },
  arrow: {
    alignSelf: "center",
    borderTopColor: "white",
    borderWidth: 10,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    marginTop: -21,
  },

  fabListBtn: {
    position: "absolute",
    bottom: 40,
    left: 20,
    backgroundColor: "white",
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 30,
    elevation: 5,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 2 },
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.3)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    height: "60%",
    padding: 0,
  },
  modalHeader: {
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  modalTitle: { fontSize: 16, fontWeight: "bold", color: "#333" },

  jobCard: {
    flexDirection: "row",
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
    alignItems: "center",
    gap: 12,
  },
  jobAvatarBox: {
    width: 45,
    height: 45,
    borderRadius: 22.5,
    borderWidth: 2,
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
    backgroundColor: "#eee",
  },
  jobAvatarImg: { width: "100%", height: "100%" },
  jobName: { fontSize: 14, fontWeight: "bold", color: "#333" },
  jobProject: { fontSize: 13, color: COLOR_PRIMARY, marginBottom: 4 },
  jobMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  statusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginLeft: 10,
  },
  statusBadgeText: { fontSize: 9, color: "white", fontWeight: "bold" },

  loadingOverlay: {
    position: "absolute",
    bottom: 50,
    alignSelf: "center",
    backgroundColor: "white",
    padding: 10,
    borderRadius: 20,
    elevation: 5,
  },

  centeredOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.3)",
    justifyContent: "flex-end",
    alignItems: "center",
    paddingBottom: 20,
  },
  iosPickerContainer: {
    backgroundColor: "white",
    width: "90%",
    borderRadius: 15,
    overflow: "hidden",
  },
  pickerHeader: {
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
    alignItems: "center",
    backgroundColor: "#f9f9f9",
  },
  pickerConfirmBtn: {
    padding: 15,
    alignItems: "center",
    borderTopWidth: 1,
    borderColor: "#eee",
    backgroundColor: "white",
  },
});
