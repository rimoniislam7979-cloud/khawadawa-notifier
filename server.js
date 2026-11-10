const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://khawa-dawa-9e3fc-default-rtdb.firebaseio.com"
});

const db = admin.database();
console.log('🚀 Notification Server started...');

// ১. অর্ডার স্ট্যাটাস পরিবর্তন
db.ref('orders').on('child_changed', async (snapshot) => {
    const order = snapshot.val();
    const orderId = snapshot.key;
    const customerUid = order.customerUid;
    const status = order.status;
    if (!customerUid) return;

    const userSnap = await db.ref(`customers/${customerUid}/fcmToken`).once('value');
    const fcmToken = userSnap.val();
    if (!fcmToken) return;

    try {
        await admin.messaging().send({
            notification: {
                title: `অর্ডার আপডেট #${orderId.substring(0, 6)}`,
                body: `আপনার অর্ডারের স্ট্যাটাস এখন: ${status}`
            },
            token: fcmToken
        });
        console.log(`✅ Order notification sent to ${customerUid}`);
    } catch (err) {
        console.error('❌ Error:', err);
    }
});

// ২. নতুন অফার
db.ref('offers').on('child_added', async (snapshot) => {
    const offer = snapshot.val();
    if (offer.status !== 'ACTIVE') return;

    const usersSnap = await db.ref('customers').once('value');
    const tokens = [];
    usersSnap.forEach(child => {
        const t = child.val().fcmToken;
        if (t) tokens.push(t);
    });
    if (tokens.length === 0) return;

    // ৫০০ টোকেনের বেশি হলে ব্যাচে পাঠাতে হবে
    const chunks = [];
    for (let i = 0; i < tokens.length; i += 500) chunks.push(tokens.slice(i, i + 500));

    for (const chunk of chunks) {
        try {
            await admin.messaging().sendEachForMulticast({
                notification: {
                    title: `🎉 নতুন অফার: ${offer.title}`,
                    body: offer.description || 'বিস্তারিত দেখতে ট্যাপ করুন'
                },
                tokens: chunk
            });
        } catch (err) {
            console.error('❌ Offer notification error:', err);
        }
    }
    console.log(`✅ Offer notification sent to ${tokens.length} users`);
});

// ৩. অ্যাডমিন নোটিশ
db.ref('notifications').on('child_added', async (snapshot) => {
    const notif = snapshot.val();
    const targetUid = notif.customerUid;
    if (!targetUid || targetUid === 'ALL') return;

    const userSnap = await db.ref(`customers/${targetUid}/fcmToken`).once('value');
    const fcmToken = userSnap.val();
    if (!fcmToken) return;

    try {
        await admin.messaging().send({
            notification: {
                title: notif.title || 'নোটিশ',
                body: notif.message || ''
            },
            token: fcmToken
        });
        console.log(`✅ Admin notification sent to ${targetUid}`);
    } catch (err) {
        console.error('❌ Admin notification error:', err);
    }
});