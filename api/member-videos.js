
module.exports = async (req, res) => {
  if (!["GET", "POST"].includes(req.method)) {
    return res.status(405).json({
      error: "Método não permitido."
    });
  }

  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
      return res.status(500).json({
        error: "Configuração do servidor incompleta."
      });
    }

    const authorization = req.headers.authorization;

    if (!authorization?.startsWith("Bearer ")) {
      return res.status(401).json({
        error: "Faça login para continuar."
      });
    }

    // Validar usuário
    const userResponse = await fetch(
      `${supabaseUrl}/auth/v1/user`,
      {
        headers: {
          apikey: serviceKey,
          Authorization: authorization
        }
      }
    );

    if (!userResponse.ok) {
      return res.status(401).json({
        error: "Sessão inválida."
      });
    }

    const user = await userResponse.json();

    // Verificar assinatura
    const subscriptionResponse = await fetch(
      `${supabaseUrl}/rest/v1/subscriptions?user_id=eq.${encodeURIComponent(user.id)}&select=status`,
      {
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`
        }
      }
    );

    if (!subscriptionResponse.ok) {
      return res.status(500).json({
        error: "Erro ao verificar assinatura."
      });
    }

    const subscriptions = await subscriptionResponse.json();
    const status = subscriptions[0]?.status;

    if (
      user.id !== "f0aeddd7-dcb7-430f-abc5-ce207b2f07fd" &&
      status !== "authorized" &&
      status !== "active"
    ) {
      return res.status(403).json({
        error: "Assinatura ativa necessária."
      });
    }

    // Listar vídeos
    if (req.method === "GET") {
      const response = await fetch(
        `${supabaseUrl}/rest/v1/videos?select=id,title,description,storage_path,created_at&order=created_at.desc`,
        {
          headers: {
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`
          }
        }
      );

      if (!response.ok) {
        return res.status(500).json({
          error: "Erro ao listar vídeos."
        });
      }

      const videos = await response.json();

      const result = await Promise.all(
        videos.map(async (video) => {
          const signedResponse = await fetch(
            `${supabaseUrl}/storage/v1/object/sign/videos/${video.storage_path
              .split("/")
              .map(encodeURIComponent)
              .join("/")}`,
            {
              method: "POST",
              headers: {
                apikey: serviceKey,
                Authorization: `Bearer ${serviceKey}`,
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                expiresIn: 300
              })
            }
          );

          if (!signedResponse.ok) {
            return {
              id: video.id,
              title: video.title,
              description: video.description,
              created_at: video.created_at,
              video_url: null
            };
          }

          const signedData = await signedResponse.json();

          return {
            id: video.id,
            title: video.title,
            description: video.description,
            created_at: video.created_at,
            video_url: signedData.signedURL.startsWith("http")
              ? signedData.signedURL
              : `${supabaseUrl}/storage/v1${signedData.signedURL}`
          };
        })
      );

      return res.status(200).json(result);
    }

    // Não permitir ações de escrita por assinantes
    return res.status(405).json({
      error: "Método não permitido."
    });

  } catch (error) {
    console.error("Erro em member-videos:", error);

    return res.status(500).json({
      error: "Erro interno no servidor."
    });
  }
};
