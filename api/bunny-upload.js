
const crypto = require("crypto");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido." });
  }

  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const libraryId = process.env.BUNNY_LIBRARY_ID;
    const bunnyKey = process.env.BUNNY_API_KEY;
    const adminId = "f0aeddd7-dcb7-430f-abc5-ce207b2f07fd";

    const authorization = req.headers.authorization;

    if (!authorization?.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Faça login." });
    }

    const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        apikey: supabaseKey,
        Authorization: authorization
      }
    });

    if (!userResponse.ok) {
      return res.status(401).json({ error: "Sessão inválida." });
    }

    const user = await userResponse.json();

    if (user.id !== adminId) {
      return res.status(403).json({ error: "Acesso restrito." });
    }

    if (!libraryId || !bunnyKey) {
      return res.status(500).json({ error: "Configuração Bunny incompleta." });
    }

    const title = req.body?.title;

    if (typeof title !== "string" || !title.trim() || title.length > 120) {
      return res.status(400).json({ error: "Título inválido." });
    }

    const createResponse = await fetch(
      `https://video.bunnycdn.com/library/${libraryId}/videos`,
      {
        method: "POST",
        headers: {
          AccessKey: bunnyKey,
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify({ title: title.trim() })
      }
    );

    if (!createResponse.ok) {
      console.error("Erro Bunny:", createResponse.status);
      return res.status(502).json({ error: "Não foi possível criar o vídeo no Bunny." });
    }

    const video = await createResponse.json();
    const expires = Math.floor(Date.now() / 1000) + 21600;

    const signature = crypto
      .createHash("sha256")
      .update(`${libraryId}${bunnyKey}${expires}${video.guid}`)
      .digest("hex");

    return res.status(200).json({
      videoId: video.guid,
      libraryId,
      endpoint: "https://video.bunnycdn.com/tusupload",
      signature,
      expires
    });

  } catch (error) {
    console.error("Erro Bunny upload:", error);
    return res.status(500).json({ error: "Erro interno ao preparar envio." });
  }
};
