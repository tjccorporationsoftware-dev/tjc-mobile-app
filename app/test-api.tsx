import axios from "axios";
import React, { useState } from "react";
import { Button, StyleSheet, Text, TextInput, View } from "react-native";
import { API_BASE } from "../constants/config"; // ใช้ค่าเดิมของคุณ

export default function TestAPI() {
  const [result, setResult] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  // ทดสอบว่า API ONLINE ไหม
  const testConnection = async () => {
    try {
      const url = `${API_BASE}/test.php`; // คุณมีไฟล์นี้แล้ว
      const res = await axios.get(url);
      setResult("✔ CONNECTED → " + res.data);
    } catch (err) {
      setResult("❌ ERROR CONNECTING TO API\n" + err);
    }
  };

  // ทดสอบ Login จริง
  const testLogin = async () => {
    try {
      const url = `${API_BASE}/api_mobile.php?action=login`;

      const res = await axios.post(url, {
        username,
        password
      });

      setResult(JSON.stringify(res.data, null, 2));
    } catch (err) {
      setResult("❌ LOGIN ERROR\n" + err);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>API TEST PAGE</Text>

      <Button title="ทดสอบการเชื่อมต่อ API" onPress={testConnection} />

      <View style={{ height: 20 }} />

      <TextInput
        style={styles.input}
        placeholder="Username"
        onChangeText={setUsername}
      />

      <TextInput
        style={styles.input}
        placeholder="Password"
        secureTextEntry
        onChangeText={setPassword}
      />

      <Button title="ทดสอบ Login" onPress={testLogin} />

      <View style={{ marginTop: 20 }}>
        <Text style={styles.output}>{result}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: "#fff",
    marginTop: 40
  },
  title: {
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: 10
  },
  input: {
    borderWidth: 1,
    borderColor: "#aaa",
    borderRadius: 8,
    padding: 10,
    marginBottom: 10
  },
  output: {
    fontSize: 15,
    color: "#333",
    marginTop: 10
  }
});
