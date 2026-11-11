module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Método não permitido"
    });
  }

  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const mpToken = process.env.MP_ACCESS_TOKEN;
    const environment = process.env.VERCEL_ENV;

    if (!supabaseUrl || !supabaseKey || !mpToken) {
      console.error("Configuração incompleta:", {
        supabaseUrl: Boolean(supabaseUrl),
        supabaseKey: Boolean(supabaseKey),
        mpToken: Boolean(mpToken)
      });

      return res.status(500).json({
        error: "Configuração do servidor incompleta"
      });
    }

    let siteUrl;

    if (environment === "preview") {
      const branchUrl = process.env.VERCEL_BRANCH_URL;

      if (!branchUrl) {
        return res.status(500).json({
          error: "Endereço do ambiente de teste não encontrado."
        });
      }

      siteUrl = `https://${branchUrl}`;

    } else if (environment === "production") {
      siteUrl = "https://tredhost-theta.vercel.app";

    } else {
      return res.status(500).json({
        error: "Ambiente do servidor não identificado."
      });
    }

    const authorization = req.headers.authorization;

    if (!authorization || !authorization.startsWith("Bearer ")) {
      return res.status(401).json({
        error: "Faça login antes de assinar."
      });
    }

    const userResponse = await fetch(
      `${supabaseUrl}/auth/v1/user`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: authorization
        }
      }
    );

    if (!userResponse.ok) {
      return res.status(401).json({
        error: "Sessão inválida. Faça login novamente."
      });
    }

    const user = await userResponse.json();

    if (!user.email || !user.id) {
      return res.status(400).json({
        error: "Não foi possível identificar sua conta."
      });
    }

    // E-mail de teste no Preview.
    // E-mail real do cliente em Production.
    const payerEmail =
      environment === "preview"
        ? "test@testuser.com"
        : user.email;

    const mpResponse = await fetch(
      "https://api.mercadopago.com/preapproval",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${mpToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          reason: "Assinatura mensal MEMBROStred",
          external_reference: user.id,
          payer_email: payerEmail,
          auto_recurring: {
            frequency: 1,
            frequency_type: "months",
            transaction_amount: 14.90,
            currency_id: "BRL"
          },
          back_url: `${siteUrl}/?assinatura=retorno`
        })
      }
    );

    const subscription = await mpResponse.json();

    if (!mpResponse.ok) {
      console.error("Erro Mercado Pago:", {
        status: mpResponse.status,
        message: subscription.message,
        cause: subscription.cause
      });

      return res.status(502).json({
        error: "Não foi possível criar a assinatura."
      });
    }

    return res.status(200).json({
      init_point: subscription.init_point
    });

  } catch (error) {
    console.error("Erro ao criar assinatura:", error);

    return res.status(500).json({
      error: "Erro interno ao iniciar assinatura."
    });
  }
};
