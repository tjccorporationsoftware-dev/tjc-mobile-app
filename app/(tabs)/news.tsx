import { FontAwesome5, Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import axios from "axios";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
    ActivityIndicator,
    Dimensions,
    FlatList,
    Image,
    Linking,
    Modal,
    Platform,
    RefreshControl,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    useWindowDimensions,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { API_BASE } from "../../constants/config";

const NEWS_IMG_BASE =
  API_BASE.replace("/api_mobile.php", "") + "/uploads/news/";

// Helper to format Thai Date short version (e.g. 19 ม.ค. 2569 10:30 น.)
const formatThaiDateShort = (dateString: string) => {
  if (!dateString) return "-";
  const date = new Date(dateString);
  const months = [
    "ม.ค.",
    "ก.พ.",
    "มี.ค.",
    "เม.ย.",
    "พ.ค.",
    "มิ.ย.",
    "ก.ค.",
    "ส.ค.",
    "ก.ย.",
    "ต.ค.",
    "พ.ย.",
    "ธ.ค.",
  ];
  const day = date.getDate();
  const month = months[date.getMonth()];
  const year = date.getFullYear() + 543;
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  return `${day} ${month} ${year} ${hours}:${minutes} น.`;
};

// Helper for date filter label
const formatThaiDateObj = (date: Date) => {
  const months = [
    "ม.ค.",
    "ก.พ.",
    "มี.ค.",
    "เม.ย.",
    "พ.ค.",
    "มิ.ย.",
    "ก.ค.",
    "ส.ค.",
    "ก.ย.",
    "ต.ค.",
    "พ.ย.",
    "ธ.ค.",
  ];
  const day = date.getDate();
  const month = months[date.getMonth()];
  const year = date.getFullYear() + 543;
  return `${day} ${month} ${year}`;
};

export default function NewsScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();

  // Calculate card width for 2 columns with padding
  const cardWidth = (width - 48) / 2; // 48 = paddingHorizontal (16*2) + gap (16)

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [newsList, setNewsList] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);

  const [selectedCat, setSelectedCat] = useState("all");
  const [searchText, setSearchText] = useState("");

  // Date Filter
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Modal
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedNews, setSelectedNews] = useState<any>(null);
  const [imageHeights, setImageHeights] = useState<{ [key: string]: number }>(
    {},
  );
  const [showFullImage, setShowFullImage] = useState(false);
  const [fullImageUrl, setFullImageUrl] = useState("");

  // --- Fetch ---
  // --- Fetch ---
  const fetchNews = async () => {
    try {
      if (!refreshing) setLoading(true);
      const dateStr = selectedDate
        ? selectedDate.toISOString().split("T")[0]
        : "";
      const url = `${API_BASE}/api_mobile.php?action=get_announcements&search=${searchText}&type=${selectedCat}&date=${dateStr}`;
      const res = await axios.get(url);

      if (res.data.status === "success") {
        let news = res.data.news || [];

        // 🟢 เพิ่มส่วนนี้: เรียงลำดับข้อมูลใหม่ (ปักหมุดก่อน -> วันที่ล่าสุด)
        news.sort((a: any, b: any) => {
          // แปลงค่า is_pinned เป็นตัวเลข (เผื่อ API ส่งมาเป็น string "1")
          const pinA = a.is_pinned == 1 ? 1 : 0;
          const pinB = b.is_pinned == 1 ? 1 : 0;

          // 1. เช็คปักหมุดก่อน (มากไปน้อย: 1 มาก่อน 0)
          if (pinA !== pinB) return pinB - pinA;

          // 2. ถ้าปักหมุดเหมือนกัน ให้เรียงตามวันที่ (ใหม่ไปเก่า)
          return (
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          );
        });

        setNewsList(news);
        const serverCats = res.data.categories || [];
        setCategories([{ id: "all", type_name: "ทั้งหมด" }, ...serverCats]);
      }
    } catch (error) {
      console.log("Fetch News Error:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (selectedNews) {
      const images = getImages(
        selectedNews.attachment || selectedNews.image_url,
      );
      images.forEach((img) => {
        // ใช้ RNImage.getSize เพื่อหาขนาดจริงของรูป
        Image.getSize(
          NEWS_IMG_BASE + img,
          (imgWidth, imgHeight) => {
            // คำนวณความสูงที่เหมาะสมตามสัดส่วนหน้าจอ (width - 40 คือความกว้างคอนเทนเนอร์)
            const containerWidth = width - 40;
            const calculatedHeight = (imgHeight / imgWidth) * containerWidth;

            // บันทึกความสูงลง state
            setImageHeights((prev) => ({ ...prev, [img]: calculatedHeight }));
          },
          (error) => {
            console.error(`Couldn't get size for image: ${img}`, error);
          },
        );
      });
    } else {
      // ล้างค่าเมื่อปิด modal
      setImageHeights({});
    }
  }, [selectedNews, width]);

  useFocusEffect(
    useCallback(() => {
      fetchNews();
    }, [selectedCat, selectedDate]),
  );

  const handleSearch = () => fetchNews();

  const onDateChange = (event: any, date?: Date) => {
    if (Platform.OS === "android") setShowDatePicker(false);
    if (date) setSelectedDate(date);
  };

  const clearDateFilter = () => setSelectedDate(null);

  // Actions
  const openNewsDetail = (item: any) => {
    setSelectedNews(item);
    setShowFullImage(false);
    setModalVisible(true);
  };

  const openFile = (filename: string) => {
    const url = NEWS_IMG_BASE + filename;
    Linking.openURL(url).catch((err) =>
      console.error("Couldn't load page", err),
    );
  };

  const getBadgeColor = (colorClass: string): [string, string] => {
    switch (colorClass) {
      case "primary":
        return ["#3b82f6", "#2563eb"];
      case "success":
        return ["#22c55e", "#16a34a"];
      case "danger":
        return ["#ef4444", "#dc2626"];
      case "warning":
        return ["#f59e0b", "#d97706"];
      case "info":
        return ["#06b6d4", "#0891b2"];
      default:
        return ["#64748b", "#475569"]; // secondary
    }
  };

  // Helper to parse multiple images
  const getImages = (attachmentString: string) => {
    if (!attachmentString) return [];
    return attachmentString
      .split(",")
      .filter((f) =>
        ["jpg", "jpeg", "png", "gif", "webp"].includes(
          f.split(".").pop()?.toLowerCase() || "",
        ),
      );
  };

  const renderItem = ({ item }: { item: any }) => {
    const images = getImages(item.attachment || item.image_url); // Fallback to image_url if attachment is new structure
    const hasImage = images.length > 0;
    const coverImage = hasImage ? images[0] : null;
    const imageCount = images.length;
    const badgeColors = getBadgeColor(item.color_class);
    const isPinned = item.is_pinned === 1 || item.is_pinned === "1";

    return (
      <View style={[styles.card, { width: cardWidth }]}>
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => openNewsDetail(item)}
          style={styles.cardCover}
        >
          {/* Pinned Icon */}
          {isPinned && (
            <View style={styles.pinBadge}>
              <FontAwesome5 name="thumbtack" size={12} color="#fff" />
            </View>
          )}

          {/* Type Badge */}
          <LinearGradient
            colors={badgeColors}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.badge}
          >
            <Text style={styles.badgeText}>{item.type_name || "ทั่วไป"}</Text>
          </LinearGradient>

          {hasImage ? (
            <>
              <Image
                source={{ uri: NEWS_IMG_BASE + coverImage }}
                style={styles.cardImage}
                resizeMode="cover"
              />
              {imageCount > 1 && (
                <View style={styles.multiImgBadge}>
                  <Ionicons name="images-outline" size={12} color="#fff" />
                  <Text style={styles.multiImgText}>+{imageCount - 1}</Text>
                </View>
              )}
            </>
          ) : (
            <View style={[styles.cardImage, styles.placeholderImage]}>
              <FontAwesome5 name="bullhorn" size={32} color="#cbd5e1" />
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => openNewsDetail(item)}
          style={styles.cardContent}
        >
          <View style={styles.metaRow}>
            <View style={styles.metaItem}>
              <Ionicons name="time-outline" size={12} color="#64748b" />
              <Text style={styles.metaText} numberOfLines={1}>
                {formatThaiDateShort(item.created_at)}
              </Text>
            </View>
          </View>

          <Text style={styles.cardTitle} numberOfLines={2}>
            {item.title}
          </Text>

          <View style={styles.readMore}>
            <Text style={styles.readMoreText}>อ่านเพิ่มเติม</Text>
            <Ionicons name="chevron-forward" size={12} color="#2563eb" />
          </View>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <StatusBar barStyle="dark-content" backgroundColor="#f0f4f8" />

      {/* Header with Gradient Text Concept (using color since RN text gradient needs lib) */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>
          <Text style={{ color: "#3b82f6" }}>📰</Text> ข่าวประชาสัมพันธ์
        </Text>
      </View>

      {/* Filter Bar (Glassmorphism style) */}
      <View style={styles.filterSection}>
        <View style={styles.filterBar}>
          {/* Search */}
          <View style={styles.searchBox}>
            <Ionicons name="search" size={16} color="#3b82f6" />
            <TextInput
              style={styles.searchInput}
              placeholder="ค้นหา..."
              value={searchText}
              onChangeText={setSearchText}
              onSubmitEditing={handleSearch}
              placeholderTextColor="#94a3b8"
            />
          </View>

          {/* Date Picker Button */}
          <TouchableOpacity
            style={[styles.filterBtn, selectedDate && styles.filterBtnActive]}
            onPress={() => setShowDatePicker(true)}
          >
            <Ionicons
              name="calendar-outline"
              size={18}
              color={selectedDate ? "#fff" : "#475569"}
            />
          </TouchableOpacity>

          {selectedDate && (
            <TouchableOpacity style={styles.clearBtn} onPress={clearDateFilter}>
              <Ionicons name="close" size={16} color="#fff" />
            </TouchableOpacity>
          )}
        </View>

        {/* Categories Horizontal Scroll */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.catScroll}
          contentContainerStyle={{ paddingRight: 20 }}
        >
          {categories.map((cat) => (
            <TouchableOpacity
              key={cat.id}
              style={[
                styles.catChip,
                selectedCat == cat.id && styles.catChipActive,
              ]}
              onPress={() => setSelectedCat(cat.id)}
            >
              <Text
                style={[
                  styles.catText,
                  selectedCat == cat.id && styles.catTextActive,
                ]}
              >
                {cat.type_name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Date Picker Modal for iOS / Default for Android */}
      {showDatePicker &&
        (Platform.OS === "ios" ? (
          <Modal
            transparent
            animationType="fade"
            visible={showDatePicker}
            onRequestClose={() => setShowDatePicker(false)}
          >
            <View style={styles.iosDatePickerOverlay}>
              <View style={styles.iosDatePickerContainer}>
                <View style={styles.iosPickerHeader}>
                  <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                    <Text style={styles.iosCancelText}>ยกเลิก</Text>
                  </TouchableOpacity>
                  <Text style={{ fontWeight: "bold", fontSize: 16 }}>
                    เลือกวันที่
                  </Text>
                  <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                    <Text style={styles.iosDoneText}>ตกลง</Text>
                  </TouchableOpacity>
                </View>
                <DateTimePicker
                  value={selectedDate || new Date()}
                  mode="date"
                  display="inline"
                  locale="th-TH"
                  onChange={onDateChange}
                  maximumDate={new Date()}
                  style={{ height: 300 }}
                />
              </View>
            </View>
          </Modal>
        ) : (
          <DateTimePicker
            value={selectedDate || new Date()}
            mode="date"
            display="default"
            onChange={onDateChange}
            maximumDate={new Date()}
          />
        ))}

      {/* News Grid */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#2563eb" />
        </View>
      ) : (
        <FlatList
          data={newsList}
          renderItem={renderItem}
          keyExtractor={(item) => item.id.toString()}
          numColumns={2} // Grid Layout
          columnWrapperStyle={{
            justifyContent: "space-between",
            paddingHorizontal: 16,
          }}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                fetchNews();
              }}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="folder-open-outline" size={60} color="#cbd5e1" />
              <Text style={styles.emptyText}>ไม่พบข้อมูลข่าวสาร</Text>
              {selectedDate && (
                <Text style={styles.emptySubText}>
                  ในวันที่ {formatThaiDateObj(selectedDate)}
                </Text>
              )}
            </View>
          }
        />
      )}

      {/* Detail Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => {
          if (showFullImage) setShowFullImage(false);
          else setModalVisible(false);
        }}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalHeaderTitle}>รายละเอียดข่าว</Text>
            <TouchableOpacity
              onPress={() => setModalVisible(false)}
              style={styles.closeBtn}
            >
              <Ionicons name="close-circle" size={30} color="#64748b" />
            </TouchableOpacity>
          </View>

          {selectedNews && (
            <ScrollView contentContainerStyle={styles.modalScrollContent}>
              {/* Badge */}
              <View style={styles.modalMetaRow}>
                <LinearGradient
                  colors={getBadgeColor(selectedNews.color_class)}
                  style={styles.badgeSmall}
                >
                  <Text style={styles.badgeTextSmall}>
                    {selectedNews.type_name || "ทั่วไป"}
                  </Text>
                </LinearGradient>
                <View style={{ flex: 1 }} />
                {selectedNews.is_pinned == 1 && (
                  <FontAwesome5 name="thumbtack" size={16} color="#f59e0b" />
                )}
              </View>

              <Text style={styles.detailTitle}>{selectedNews.title}</Text>

              <View style={styles.detailMeta}>
                <Text style={styles.metaText}>
                  <Ionicons name="calendar-outline" />{" "}
                  {formatThaiDateShort(selectedNews.created_at)}
                </Text>
                <Text style={styles.metaText}> | </Text>
                <Text style={styles.metaText}>
                  <Ionicons name="person-outline" /> {selectedNews.created_by}
                </Text>
              </View>

              {/* Gallery Section */}
              {getImages(selectedNews.attachment || selectedNews.image_url)
                .length > 0 && (
                <View style={styles.galleryContainer}>
                  {getImages(
                    selectedNews.attachment || selectedNews.image_url,
                  ).map((img, index) => {
                    // 🟢 4. ดึงความสูงที่คำนวณไว้ (ถ้ายังไม่เสร็จให้ใช้ค่าเริ่มต้น)
                    const dynamicHeight = imageHeights[img] || 200;

                    return (
                      <TouchableOpacity
                        key={index}
                        onPress={() => {
                          setFullImageUrl(img);
                          setShowFullImage(true);
                        }}
                        activeOpacity={0.9}
                      >
                        {/* 🟢 5. ใช้ RNImage และกำหนด style แบบ dynamic */}
                        <Image
                          source={{ uri: NEWS_IMG_BASE + img }}
                          style={[
                            styles.galleryImage,
                            { height: dynamicHeight },
                          ]}
                          resizeMode="contain"
                        />
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              <View style={styles.divider} />

              <Text style={styles.detailBody}>{selectedNews.content}</Text>

              {/* PDF Attachment (Simple check if filename ends in pdf) */}
              {(selectedNews.attachment || "")
                .split(",")
                .map((f: string, i: number) => {
                  if (f.trim().toLowerCase().endsWith(".pdf")) {
                    return (
                      <TouchableOpacity
                        key={i}
                        style={styles.pdfButton}
                        onPress={() => openFile(f)}
                      >
                        <FontAwesome5
                          name="file-pdf"
                          size={24}
                          color="#ef4444"
                        />
                        <View style={{ flex: 1, marginLeft: 15 }}>
                          <Text style={styles.pdfBtnTitle}>
                            เอกสารแนบ (PDF)
                          </Text>
                          <Text style={styles.pdfBtnSub}>
                            แตะเพื่อเปิดดูไฟล์
                          </Text>
                        </View>
                        <Ionicons
                          name="download-outline"
                          size={20}
                          color="#94a3b8"
                        />
                      </TouchableOpacity>
                    );
                  }
                  return null;
                })}
            </ScrollView>
          )}

          {/* 🟢 แก้ไข: Full Image Viewer แบบเลื่อนลงดูรูปทั้งหมดได้ */}
          {showFullImage && selectedNews && (
            <Modal
              visible={true}
              transparent={true}
              animationType="fade"
              onRequestClose={() => setShowFullImage(false)}
            >
              <View style={styles.fullImageOverlay}>
                <TouchableOpacity
                  style={styles.fullImageCloseBtn}
                  onPress={() => setShowFullImage(false)}
                >
                  <Ionicons name="close-circle" size={40} color="white" />
                </TouchableOpacity>

                <FlatList
                  data={getImages(
                    selectedNews.attachment || selectedNews.image_url,
                  )}
                  keyExtractor={(item, index) => index.toString()}
                  renderItem={({ item }) => (
                    <View style={styles.fullImageWrapper}>
                      <Image
                        source={{ uri: NEWS_IMG_BASE + item }}
                        style={styles.fullImageScroll}
                        resizeMode="contain"
                      />
                    </View>
                  )}
                  contentContainerStyle={{ paddingVertical: 80 }} // เว้นที่ให้ปุ่มปิดด้านบน
                />
              </View>
            </Modal>
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f0f4f8" }, // Light gray-blue bg
  center: { flex: 1, justifyContent: "center", alignItems: "center" },

  header: { padding: 20, paddingBottom: 10, backgroundColor: "transparent" },
  headerTitle: { fontSize: 28, fontWeight: "800", color: "#1e293b" },

  filterSection: { paddingHorizontal: 16, marginBottom: 10 },
  filterBar: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderRadius: 50,
    padding: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
    marginBottom: 15,
    alignItems: "center",
  },
  searchBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 15,
  },
  searchInput: { flex: 1, marginLeft: 8, fontSize: 14, color: "#1e293b" },
  filterBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#f1f5f9",
    justifyContent: "center",
    alignItems: "center",
  },
  filterBtnActive: { backgroundColor: "#3b82f6" },
  clearBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#ef4444",
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 5,
    marginRight: 5,
  },

  catScroll: { flexDirection: "row" },
  catChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.5)",
    marginRight: 8,
    shadowColor: "#000",
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  catChipActive: { backgroundColor: "#3b82f6", borderColor: "#3b82f6" },
  catText: { fontSize: 13, color: "#64748b", fontWeight: "600" },
  catTextActive: { color: "#fff" },

  listContent: { paddingBottom: 50, paddingTop: 10 },

  // Card Styles
  card: {
    backgroundColor: "#fff",
    borderRadius: 20,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#fff",
  },
  cardCover: { height: 160, backgroundColor: "#334155", position: "relative" },
  cardImage: { width: "100%", height: "100%" },
  placeholderImage: {
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f1f5f9",
  },

  // Overlays
  badge: {
    position: "absolute",
    top: 12,
    left: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: { color: "#fff", fontSize: 10, fontWeight: "bold" },

  pinBadge: {
    position: "absolute",
    top: 12,
    right: 12,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#f59e0b",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 2,
  },

  multiImgBadge: {
    position: "absolute",
    bottom: 8,
    right: 8,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  multiImgText: { color: "#fff", fontSize: 10, fontWeight: "700" },

  cardContent: { padding: 15 },
  metaRow: { flexDirection: "row", marginBottom: 6 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaText: { fontSize: 11, color: "#64748b" },
  cardTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1e293b",
    marginBottom: 8,
    lineHeight: 20,
    height: 40,
  }, // Fixed height for 2 lines
  readMore: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    marginTop: 4,
  },
  readMoreText: { fontSize: 12, color: "#2563eb", fontWeight: "600" },

  // Modal Styles
  modalContainer: { flex: 1, backgroundColor: "#fff" },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  modalHeaderTitle: { fontSize: 18, fontWeight: "800", color: "#1e293b" },
  closeBtn: { padding: 0 },

  modalScrollContent: { padding: 20, paddingBottom: 50 },
  modalMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 15,
  },
  badgeSmall: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  badgeTextSmall: { color: "#fff", fontSize: 12, fontWeight: "bold" },

  detailTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#1e293b",
    marginBottom: 10,
    lineHeight: 30,
  },
  detailMeta: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
    flexWrap: "wrap",
  },

  galleryContainer: { marginBottom: 20 },
  galleryImage: {
    width: "100%",
    borderRadius: 16,
    marginBottom: 15,
    borderWidth: 1,
    backgroundColor: "#f1f5f9",
    borderColor: "#e2e8f0",
  },

  divider: { height: 1, backgroundColor: "#e2e8f0", marginBottom: 20 },
  detailBody: { fontSize: 16, color: "#334155", lineHeight: 26 },

  pdfButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fef2f2",
    padding: 15,
    borderRadius: 16,
    marginTop: 20,
    borderWidth: 1,
    borderColor: "#fee2e2",
  },
  pdfBtnTitle: { fontSize: 14, fontWeight: "700", color: "#991b1b" },
  pdfBtnSub: { fontSize: 12, color: "#ef4444" },

  fullImageOverlay: { flex: 1, backgroundColor: "#000" }, // พื้นหลังดำทึบ
  fullImageCloseBtn: {
    position: "absolute",
    top: 40,
    right: 20,
    zIndex: 100,
    padding: 10,
  },

  fullImageWrapper: {
    width: Dimensions.get("window").width, // <--- บรรทัดนี้จะหายแดงเมื่อ Import Dimensions แล้ว
    height: Dimensions.get("window").height * 0.8,
    marginBottom: 40,
    justifyContent: "center",
    alignItems: "center",
  },

  fullImageScroll: { width: "100%", height: "100%" }, // รูปขยายเต็มกล่อง Wrapper

  emptyState: { alignItems: "center", marginTop: 80, opacity: 0.7 },
  emptyText: {
    color: "#64748b",
    fontSize: 16,
    marginTop: 10,
    fontWeight: "600",
  },
  emptySubText: { color: "#94a3b8", fontSize: 14, marginTop: 5 },

  // iOS Picker
  iosDatePickerOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.3)",
    justifyContent: "flex-end",
  },
  iosDatePickerContainer: {
    backgroundColor: "white",
    paddingBottom: 20,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  iosPickerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 15,
    borderBottomWidth: 1,
    borderColor: "#f1f5f9",
  },
  iosDoneText: { color: "#2563eb", fontWeight: "bold", fontSize: 16 },
  iosCancelText: { color: "#64748b", fontSize: 16 },
});
