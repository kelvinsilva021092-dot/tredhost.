
const crypto = require("crypto");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).end();
  }

  try {
    const secret = process.env.MP_WEBHOOK_SECRET;
    const mpToken = process.env.MP_ACCESS_TOKEN;
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!secret || !mpToken || !supabaseUrl || !supabaseKey) {
      console.error("Variáveis do servidor ausentes");
      return res.status(500).end();
    }

    const signature = req.headers["x-signature"] || "";
    const requestId = req.headers["x-request-id"] || "";
    const dataId = req.query["data.id"];

    const parts = Object.fromEntries(
      signature.split(",").map(part => {
        const [key, value] = part.trim().split("=");
        return [key, value];
      })
    );

    const ts = parts.ts;
    const receivedHash = parts.v1;

    if (!ts || !receivedHash || !dataId || !requestId) {
      return res.status(400).end();
    }

    // Valida a assinatura enviada pelo Mercado Pago
    const timestamp = Number(ts);

    if (!Number.isFinite(timestamp) ||
        Math.abs(Date.now() / 1000 - timestamp) > 300) {
      return res.status(401).end();
    }

    const manifest =
      `id:${String(dataId).toLowerCase()};` +
      `request-id:${requestId};ts:${ts};`;

    const expectedHash = crypto
      .createHmac("sha256", secret)
      .update(manifest)
      .digest("hex");

    const received = Buffer.from(receivedHash, "hex");
    const expected = Buffer.from(expectedHash, "hex");

    if (
      received.length !== expected.length ||
      !crypto.timingSafeEqual(received, expected)
    ) {
      return res.status(401).end();
    }

    const eventType = req.body?.type || req.query.type;

    // Atualizamos o acesso somente com o estado
    // confirmado diretamente na API do Mercado Pago.
    if (eventType !== "subscription_preapproval") {
      return res.status(200).json({ received: true });
    }

    const mpResponse = await fetch(
      `https://api.mercadopago.com/preapproval/${encodeURIComponent(dataId)}`,
      {
        headers: {
          Authorization: `Bearer ${mpToken}`
        }
      }
    );

    if (!mpResponse.ok) {
      console.error("Falha ao consultar assinatura no Mercado Pago");
      return res.status(502).end();
    }

    const subscription = await mpResponse.json();

    const userId = subscription.external_reference;
    const status = subscription.status;

    if (!userId || !status) {
      return res.status(400).end();
    }

    // Salva o status confirmado no Supabase
    const dbResponse = await fetch(
      `${supabaseUrl}/rest/v1/subscriptions?on_conflict=user_id`,
      {
        method: "POST",
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates,return=minimal"
        },
        body: JSON.stringify({
          user_id: userId,
          mp_preapproval_id: subscription.id,
          status: status,
          updated_at: new Date().toISOString()
        })
      }
    );

    if (!dbResponse.ok) {
      console.error("Falha ao atualizar assinatura no Supabase");
      return res.status(500).end();
    }

    return res.status(200).json({ received: true });

  } catch (error) {
    console.error("Erro no webhook:", error);
    return res.status(500).end();
  }
};

