
module.exports = async (req, res) => {
  if (req.method !== "GET") {
    return res.status(405).json({
      error: "Método não permitido"
    });
  }

  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({
        error: "Configuração do servidor incompleta"
      });
    }

    const authorization = req.headers.authorization;

    if (!authorization || !authorization.startsWith("Bearer ")) {
      return res.status(401).json({
        active: false,
        error: "Faça login para continuar."
      });
    }

    // Valida a sessão do usuário no Supabase
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
        active: false,
        error: "Sessão inválida. Faça login novamente."
      });
    }

    const user = await userResponse.json();

    // Consulta a assinatura usando a chave secreta do servidor
    const subscriptionResponse = await fetch(
      `${supabaseUrl}/rest/v1/subscriptions?user_id=eq.${encodeURIComponent(user.id)}&select=status,mp_preapproval_id`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`
        }
      }
    );

    if (!subscriptionResponse.ok) {
      const errorDetails = await subscriptionResponse.text();

      console.error(
        "Erro na consulta Supabase:",
        subscriptionResponse.status,
        errorDetails
      );

      return res.status(500).json({
        active: false,
        error: "Não foi possível consultar sua assinatura."
      });
    }

    const subscriptions = await subscriptionResponse.json();
    const subscription = subscriptions[0];

    const active =
      subscription?.status === "authorized" ||
      subscription?.status === "active";

    return res.status(200).json({
      active,
      status: subscription?.status || "not_subscribed"
    });

  } catch (error) {
    console.error("Erro ao verificar assinatura:", error);

    return res.status(500).json({
      active: false,
      error: "Erro ao verificar sua assinatura."
    });
  }
};
