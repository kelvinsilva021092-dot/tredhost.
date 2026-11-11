
module.exports = async (req, res) => {
  if (!["GET", "POST", "DELETE"].includes(req.method)) {
    return res.status(405).json({
      error: "Método não permitido"
    });
  }

  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const adminId = "f0aeddd7-dcb7-430f-abc5-ce207b2f07fd";

    if (!supabaseUrl || !serviceKey) {
      return res.status(500).json({
        error: "Configuração do servidor incompleta."
      });
    }

    const authorization = req.headers.authorization;

    if (!authorization?.startsWith("Bearer ")) {
      return res.status(401).json({
        error: "Faça login."
      });
    }

    const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        apikey: serviceKey,
        Authorization: authorization
      }
    });

    if (!userResponse.ok) {
      return res.status(401).json({
        error: "Sessão inválida."
      });
    }

    const user = await userResponse.json();

    if (user.id !== adminId) {
      return res.status(403).json({
        error: "Acesso restrito ao administrador."
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

      return res.status(200).json(await response.json());
    }

    // Registrar vídeo enviado ao Storage
    if (req.method === "POST") {
      const { title, description, storage_path } = req.body || {};

      if (!title || !storage_path) {
        return res.status(400).json({
          error: "Informe o título e o caminho do vídeo."
        });
      }

      if (
        typeof title !== "string" ||
        typeof storage_path !== "string" ||
        title.length > 120 ||
        storage_path.length > 500 ||
        !storage_path.startsWith(`${adminId}/`)
      ) {
        return res.status(400).json({
          error: "Dados inválidos."
        });
      }

      const response = await fetch(`${supabaseUrl}/rest/v1/videos`, {
        method: "POST",
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          "Content-Type": "application/json",
          Prefer: "return=representation"
        },
        body: JSON.stringify({
          title: title.trim(),
          description: typeof description === "string"
            ? description.trim().slice(0, 1000)
            : "",
          storage_path,
          created_at: new Date().toISOString()
        })
      });

      if (!response.ok) {
        console.error("Erro ao registrar vídeo:", response.status);

        return res.status(500).json({
          error: "Não foi possível registrar o vídeo."
        });
      }

      return res.status(201).json(await response.json());
    }

    // Excluir vídeo
    if (req.method === "DELETE") {
      const { id } = req.body || {};

      if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
        return res.status(400).json({
          error: "ID do vídeo inválido."
        });
      }

      const lookup = await fetch(
        `${supabaseUrl}/rest/v1/videos?id=eq.${encodeURIComponent(id)}&select=id,storage_path`,
        {
          headers: {
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`
          }
        }
      );

      if (!lookup.ok) {
        return res.status(500).json({
          error: "Erro ao localizar vídeo."
        });
      }

      const videos = await lookup.json();
      const video = videos[0];

      if (!video) {
        return res.status(404).json({
          error: "Vídeo não encontrado."
        });
      }

      if (!video.storage_path.startsWith(`${adminId}/`)) {
        return res.status(403).json({
          error: "Caminho de arquivo inválido."
        });
      }

      const storageResponse = await fetch(
        `${supabaseUrl}/storage/v1/object/videos/${video.storage_path
          .split("/")
          .map(encodeURIComponent)
          .join("/")}`,
        {
          method: "DELETE",
          headers: {
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`
          }
        }
      );

      if (!storageResponse.ok) {
        return res.status(500).json({
          error: "Não foi possível excluir o arquivo."
        });
      }

      const deleteResponse = await fetch(
        `${supabaseUrl}/rest/v1/videos?id=eq.${encodeURIComponent(id)}`,
        {
          method: "DELETE",
          headers: {
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`
          }
        }
      );

      if (!deleteResponse.ok) {
        return res.status(500).json({
          error: "Arquivo excluído, mas não foi possível remover o registro."
        });
      }

      return res.status(200).json({
        success: true
      });
    }

  } catch (error) {
    console.error("Erro em admin-videos:", error);

    return res.status(500).json({
      error: "Erro interno no servidor."
    });
  }
};
