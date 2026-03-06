const express = require('express');
const cors = require('cors');
const { MercadoPagoConfig, Payment } = require('mercadopago');
const admin = require('firebase-admin');

const app = express();
app.use(cors()); 
app.use(express.json());

// 1. Conecta ao Firebase usando as variáveis do Render
const serviceAccount = JSON.parse(process.env.FIREBASE_JSON);
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

// 2. Conecta ao Mercado Pago
const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
const payment = new Payment(client);

// ROTA 1: Gerar o Pix
app.post('/gerar-pix', async (req, res) => {
    try {
        const { valor, nomeAluno, emailAluno, descricao } = req.body;
        const body = {
            transaction_amount: Number(valor),
            description: descricao || `Mensalidade - ${nomeAluno}`,
            payment_method_id: 'pix',
            payer: { email: emailAluno, first_name: nomeAluno }
        };

        const result = await payment.create({ body });
        
        // Salva no Firestore
        await db.collection('mensalidades').doc(result.id.toString()).set({
            aluno: nomeAluno,
            valor: valor,
            status: 'pendente',
            dataCriacao: admin.firestore.FieldValue.serverTimestamp()
        });

        res.json({
            idTransacao: result.id,
            qrCodeBase64: result.point_of_interaction.transaction_data.qr_code_base64,
            pixCopiaECola: result.point_of_interaction.transaction_data.qr_code
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ erro: 'Erro ao gerar Pix' });
    }
});

// ROTA 2: Webhook (Aviso de pagamento)
app.post('/webhook', async (req, res) => {
    const { type, data } = req.body;
    if (type === 'payment') {
        try {
            const pagamentoInfo = await payment.get({ id: data.id });
            if (pagamentoInfo.status === 'approved') {
                await db.collection('mensalidades').doc(data.id.toString()).update({
                    status: 'pago',
                    dataPagamento: admin.firestore.FieldValue.serverTimestamp()
                });
            }
        } catch (error) {}
    }
    res.status(200).send("OK");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor online na porta ${PORT}`);
});