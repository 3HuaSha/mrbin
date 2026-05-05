const express = require('express');
const path = require('path');
const { Firestore } = require('@google-cloud/firestore');
const { google } = require('googleapis');
const app = express();
const port = process.env.PORT || 8080;

app.use(express.json());

const firestore = new Firestore();
const vehiclesCol = firestore.collection('truck_locations');
const ordersCol = firestore.collection('daily_orders');

app.use(express.static(path.join(__dirname, 'public')));

// Samsara API 代理端点
app.get('/api/samsara', async (req, res) => {
    const SAMSARA_TOKEN = process.env.SAMSARA_TOKEN || 'samsara_api_xuwBoWcChtpqYPlGqEhhpmXncEhIke';
    
    try {
        const response = await fetch('https://api.samsara.com/fleet/vehicles/locations', {
            headers: {
                'Authorization': `Bearer ${SAMSARA_TOKEN}`,
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            return res.status(response.status).json({
                success: false,
                error: `Samsara API Error: ${response.status} - ${errorText}`,
                data: []
            });
        }

        const data = await response.json();
        
        res.json({
            success: true,
            data: data.data || [],
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('❌ Samsara API Error:', error.message);
        res.status(500).json({
            success: false,
            error: error.message,
            data: []
        });
    }
});

async function syncSamsaraToFirestore() {
    const SAMSARA_TOKEN = process.env.SAMSARA_TOKEN;
    if (!SAMSARA_TOKEN) {
        console.error("❌ 错误: 未设置 SAMSARA_TOKEN 环境变量");
        return;
    }

    try {
        const response = await fetch('https://api.samsara.com/fleet/vehicles/locations', {
            headers: {
                'Authorization': `Bearer ${SAMSARA_TOKEN}`,
                'Accept': 'application/json'
            }
        });

        if (!response.ok) throw new Error(`Samsara API Error: ${response.statusText}`);

        const data = await response.json();

        if (data.data && Array.isArray(data.data)) {
            const batch = firestore.batch();
            let count = 0;

            data.data.forEach(truck => {
                const name = truck.name || "";

                if (name.toUpperCase().startsWith("BIN")) {
                    const docRef = vehiclesCol.doc(truck.id);
                    batch.set(docRef, {
                        id: truck.id,
                        name: name,
                        latitude: truck.location.latitude,
                        longitude: truck.location.longitude,
                        speed: truck.location.speed || 0,
                        lastUpdated: new Date().toISOString(),
                        isBinTruck: true
                    }, { merge: true });
                    count++;
                }
            });

            if (count > 0) {
                await batch.commit();
            }
        }
    } catch (error) {
        console.error("❌ 同步卡车位置失败:", error.message);
    }
}

setInterval(syncSamsaraToFirestore, 10000);
syncSamsaraToFirestore();

app.post('/api/sync-sheets', async (req, res) => {
    try {
        const targetDate = req.body.date;
        if (!targetDate) {
            return res.status(400).json({ error: "Missing date parameter (e.g. 6-Apr-2026)" });
        }

        console.log(`🔄 开始同步 Google Sheets, 目标日期: ${targetDate}`);

        const auth = new google.auth.GoogleAuth({
            scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
        });
        const sheets = google.sheets({ version: 'v4', auth });

        const spreadsheetId = '19wG7Uo04AwKLb72WWLw1O7wmxtvKpTbnCpiLaKgFbps';

        const metaInfo = await sheets.spreadsheets.get({ spreadsheetId });
        const targetSheet = metaInfo.data.sheets.find(s => s.properties.sheetId === 144295084);

        if (!targetSheet) {
            return res.status(500).json({ error: "找不到指定的表格标签 (gid=144295084)，请确认表格是否存在。" });
        }

        const sheetTitle = targetSheet.properties.title;
        const range = `'${sheetTitle}'!A1:T`; // 扩展到 T 列

        const response = await sheets.spreadsheets.values.get({ spreadsheetId, range });
        const rows = response.data.values;

        if (!rows || rows.length === 0) {
            return res.json({ message: "No data found.", count: 0 });
        }

        const baseFiltered = [];
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            const dateCol = row[1];    // B列: 日期
            const sotCol = row[4];    // E列: 单号 (原D→E)
            const typeCol = row[11];   // L列: 收/送 (原K→L)
            const addrCol = row[12];   // M列: 地址 (原L→M)
            const rCol = row[18];   // S列: 是否完成 (原R→S)

            if (!addrCol || addrCol.trim() === "" || !sotCol || sotCol.trim() === "") continue;
            const targetDateShort = targetDate.replace(/(\d{1,2}-\w{3}-)(\d{4})/, (_, prefix, year) => prefix + year.slice(2));
            if (dateCol !== targetDateShort) continue;
            if (rCol && rCol.toString().trim().toUpperCase() === "TRUE") continue;

            baseFiltered.push(row);
        }

        // 去重：相同地址时，"送"优先于"收"
        const uniqueMap = {};
        baseFiltered.forEach(row => {
            const addr = row[12].trim();              // M列
            const type = row[11] ? row[11].trim() : ""; // L列

            if (!uniqueMap[addr]) {
                uniqueMap[addr] = row;
            } else {
                const existingType = uniqueMap[addr][11] ? uniqueMap[addr][11].trim() : "";
                if (type === "送" && existingType === "收") {
                    uniqueMap[addr] = row;
                }
            }
        });

        const finalResults = Object.values(uniqueMap);

        const colName = req.body.collectionName || 'daily_orders';
        const ordersCol = firestore.collection(colName);

        const batch = firestore.batch();
        let deletedCount = 0;
        let addedCount = 0;

        const existingOrders = await ordersCol.get();
        existingOrders.forEach(doc => {
            batch.delete(doc.ref);
            deletedCount++;
        });

        finalResults.forEach(row => {
            const sotCol = row[4];    // E列: 单号
            const typeText = row[11];   // L列: 收/送
            const addrCol = row[12];   // M列: 地址
            const timeRaw = row[6] ? row[6].trim() : "";   // G列: 时间
            const actionFull = row[9] ? row[9].trim() : "";  // J列: BIN SIZE + 内容 (原I→J)

            let type = 'delivery';
            if (typeText === "收") {
                type = 'pickup';
            } else if (typeText && (typeText.includes("換") || typeText.includes("换") || typeText.includes("EXCHANGE"))) {
                type = 'swap';
            }

            const parsedTime = timeRaw.replace(/\d{1,2}\/\d{1,2}\/\d{4}\s*/, "").replace(/\d{1,2}-\w+-\d{4}\s*/, "").trim() || "ASAP";

            let binSize = "YD";
            const sizeMatch = actionFull.match(/\d+YD/i);
            if (sizeMatch) {
                binSize = sizeMatch[0].toUpperCase();
            }

            let binContent = actionFull.replace(/\d+YD/i, "").replace("垃圾桶", "").replace("垃圾", "").replace("(換)", "").replace("(换)", "").replace("EXCHANGE", "").trim();

            const docId = sotCol.replace(/[^a-zA-Z0-9]/g, '');
            const docRef = ordersCol.doc(docId);

            batch.set(docRef, {
                id: sotCol,
                driver: '未分配',
                labelTime: parsedTime,
                binSize: binSize,
                binContent: binContent || "待定",
                address: addrCol,
                fullAddress: addrCol,
                type: type,
                typeText: typeText || type,
                memo: row[8] ? row[8].trim() : "",          // I列: Note (原E→I)
                completed: false,
                source: 'GoogleSheet',
                date: targetDate,
                textDriver: row[7] ? row[7].trim() : "",    // H列: 司机 (原F→H)
                scheduledDriver: row[7] ? row[7].trim() : null,
                actionFull: actionFull,
                createdAt: Date.now() + Math.random()
            });
            addedCount++;
        });

        if (deletedCount > 0 || addedCount > 0) {
            await batch.commit();
        }

        console.log(`✅ 同步完成: 删除了 ${deletedCount} 个旧任务, 导入了 ${addedCount} 个新任务。`);
        res.json({ message: "Sync successful", added: addedCount, deleted: deletedCount });

    } catch (err) {
        console.error("❌ Google Sheets 同步异常:", err);
        res.status(500).json({ error: err.message });
    }
});

app.listen(port, () => {
    console.log(`🚀 调度中心服务端启动 (端口: ${port})`);
});