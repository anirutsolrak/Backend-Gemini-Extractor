require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const path = require('path');

const app = express();
const port = process.env.PORT || 5000;

// Configuração do proxy
const apiProxy = createProxyMiddleware('/api', {
    target: 'https://backend-gemini-extractor.vercel.app', // Seu backend (o mesmo que está rodando)
    changeOrigin: true, // Necessário para o CORS funcionar
});


// Não precisamos do CORS middleware tradicional neste caso
app.use(express.json({ limit: '20mb' }));

// Aplica o middleware proxy
app.use(apiProxy)


// Inicialize o cliente da API Gemini com sua chave
const geminiApiKey = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(geminiApiKey);

// Serve o arquivo index.html para a rota raiz
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.post('/api/extrair-dados', async (req, res) => {
  try {
      const contents = req.body.contents;

      if (!geminiApiKey) {
          return res.status(500).json({ error: "Chave da API Gemini não configurada no backend." });
      }
  
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      
      const base64Images = contents.map(content => {
          if(content.parts && content.parts[1] && content.parts[1].inlineData) {
          return  {
                  inlineData: {
                  data: content.parts[1].inlineData.data,
                  mimeType: content.parts[1].inlineData.mimeType,
                  }
              }
          }
          
          throw new Error('Invalid content format received from frontend');
  })

      const prompt = contents[0].parts[0].text;

  const result = await model.generateContent([prompt, ...base64Images]);
      
  const responseText = result.response.text();
  let extractedData = [];
      
      try {
          const jsonStringLimpo = responseText.replace('```json\n', '').replace('\n```', '');
          extractedData = JSON.parse(jsonStringLimpo);
      } catch (jsonError) {
          console.warn("Resposta da Gemini API não é JSON válido, tentando extrair dados como texto:", jsonError);
      }

      if (!Array.isArray(extractedData)) {
          return res.status(400).json({ error: "Nenhum texto ou dados extraídos pela API Gemini." });
      }
  
      res.json({ dados: extractedData });
      
  }   catch (error) {
    console.error("Erro no backend ao processar imagem e chamar API Gemini:", error);
      let errorMessage = "Erro interno do servidor ao processar a imagem.";
       if (error.response && error.response.text) {
           console.error("Erro no backend ao processar imagem e chamar API Gemini:", error.response.text);
           errorMessage = error.response.text
       } else if (error.message) {
         errorMessage = error.message
      }
      res.status(500).json({ error: errorMessage});
  }
});

app.listen(port, () => {
    console.log(`Servidor backend rodando na porta ${port}`);
});
