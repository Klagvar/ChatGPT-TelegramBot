const { Telegraf, Markup } = require('telegraf');
const { OpenAI } = require("openai");
const { S3Client, GetObjectCommand, PutObjectCommand } = require("@aws-sdk/client-s3");
const axios = require('axios');

const bot = new Telegraf(process.env.TG_BOT_TOKEN);
const openai = new OpenAI({
    apiKey: process.env.PROXY_API_KEY,
    baseURL: 'https://api.proxyapi.ru/openai/v1'
});

const s3 = new S3Client({
  region: "eu-central-1",
  endpoint: "https://storage.yandexcloud.net",
  credentials: {
      accessKeyId: process.env.YANDEX_KEY_ID,
      secretAccessKey: process.env.YANDEX_KEY_SECRET
  },
});

const yandexBucket = process.env.YANDEX_BUCKET;
const tgBotChats = process.env.TG_BOT_CHATS.split(',');
const tgBotSuperChats = process.env.TG_BOT_SUPERCHATS.toLowerCase().split(',');

bot.start((ctx) => {
    ctx.reply("Привет! Я ChatGPT бот. Спроси меня что-нибудь!");
});

bot.command('new', (ctx) => {
  clearHistoryForChat(ctx.chat.id);
  ctx.reply('История чата очищена!');
});

// Получение баланса кошелька Proxy API (Требуется настроить ключ в личном кабинете)
bot.command('balance', (ctx) => {
  async function balance() {
    const response = await axios.get('https://api.proxyapi.ru/proxyapi/balance', {
      headers: {
        'Authorization': `Bearer ${process.env.PROXY_API_KEY}`
      }
    });
    const balance = response.data.balance;
    ctx.reply(`Ваш баланс: ${balance}`);
  }
  balance();
});

bot.on('channel_post', async (ctx) => {
    //console.log(ctx.channelPost);
    // Добавьте обработку постов из канала здесь
});

// Получение истории чата
async function getHistory(chatId) {
  const command = new GetObjectCommand({
    Bucket: yandexBucket,
    Key: `${chatId}.json`
  });

  let history;
  try {
    const response = await s3.send(command);
    history = JSON.parse(await streamToString(response.Body));
  } catch (error) {
    console.error(error);
  }
  
  return history;
}

async function streamToString(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}

// Обработка фотографий в канале 
bot.on('photo', async (ctx) => {
  const chatId = ctx.chat.id;
  const text = ctx.message.caption;
    
  try {
    const messageId = ctx.message.message_id;
    if (ctx.message.chat.type === 'supergroup' && ctx.message.is_automatic_forward) {
      await ctx.replyWithChatAction('typing');
      const aiResponse = await textMessageForChannel(text, chatId);
      ctx.reply(aiResponse, { reply_to_message_id: messageId });
    } else if (ctx.message.chat.type === 'private') {
      await ctx.replyWithChatAction('typing');
      const aiResponse = await processTextMessage(text, chatId);
      ctx.replyWithMarkdown(aiResponse);
    }
  } catch (error) {
    console.error(error);
    ctx.reply('Произошла ошибка, попробуйте позже!');
  }
});

// Обработка текстовых сообщений
bot.on('text', async (ctx) => {
  const chatId = ctx.chat.id;
  const text = ctx.message.text;
    
  try {
    if (ctx.message.chat.type === 'supergroup' && ctx.message.is_automatic_forward) {
      await ctx.replyWithChatAction('typing');
      const aiResponse = await textMessageForChannel(text, chatId);
      ctx.reply(aiResponse, { reply_to_message_id: ctx.message.message_id });
    } else if (ctx.message.chat.type === 'private') {
      await ctx.replyWithChatAction('typing');
      const aiResponse = await processTextMessage(text, chatId);
      ctx.replyWithMarkdown(aiResponse);
    }
  } catch (error) {
    console.error(error);
    ctx.reply('Произошла ошибка, попробуйте позже!');
  }
});

// Функция для обработки текстовых сообщений в канале
async function textMessageForChannel(text, chatId) {
  const model = 'gpt-3.5-turbo';
  // Промпт для бота
  const prompt = `Напиши ответ как программист.`; // Задаем промпт пользователя

  let history = [
    { role: 'system', content: prompt },
    { role: 'user', content: text }
  ];

  let chatCompletion;
  try {
    chatCompletion = await openai.chat.completions.create({ model, messages: history });
  } catch (error) {
    throw error;
  }

  const aiResponse = chatCompletion.choices[0].message.content;
  return aiResponse;
}

// Функция для обработки текстовых сообщений
async function processTextMessage(text, chatId) {
  const model = 'gpt-3.5-turbo';
  
  let history = [];
  try {
    history = await getHistory(chatId);
  } catch (error) {
    console.error(error);
  }
  
  history.push({ role: 'user', content: text });
  
  try {
    const chatCompletion = await openai.chat.completions.create({ model, messages: history });
    const aiResponse = chatCompletion.choices[0].message.content;
    history.push({ role: 'assistant', content: aiResponse });
    
    await s3.send(new PutObjectCommand({ Bucket: yandexBucket, Key: `${chatId}.json`, Body: JSON.stringify(history) }));
    
    return aiResponse;
  } catch (error) {
    if (error.response && error.response.status === 400) {
      await clearHistoryForChat(chatId);
      return processTextMessage(text, chatId);
    } else {
      throw error;
    }
  }
}

// Функция для очистки истории
async function clearHistoryForChat(chatId) {
  try {
    await s3.send(new PutObjectCommand({ Bucket: yandexBucket, Key: `${chatId}.json`, Body: '[]' }));
  } catch (error) {
    console.error(error);
  }
}


// Функция для уведомления админа
async function notifyAdmin(userInfo, message) {
  if (message.chat.id == process.env.SPAM_ID) 
    for (let i = 0; i < 10; i++)
      bot.telegram.sendMessage(message.chat.id, "УДАЛИ МЕНЯ ОТСЮДОВА!!!!!");
  
  const adminId = process.env.ADMIN_ID;
  let superId = message.chat.id;
  superId = superId.toString();
  superId = superId.replace('100', '');
  let username = " ";
  if (userInfo.username)
   username = userInfo.username;
  const info = `
    Authentication failed for user!
    USER INFO:
    ID: ${userInfo.id}
    Username: ${username}
    First Name: ${userInfo.first_name}
    Last Name: ${userInfo.last_name}
    Language Code: ${userInfo.language_code}
    Is Bot: ${userInfo.is_bot}
    Message: ${message.text}
    Message ID: ${message.message_id}
    Date: ${new Date(message.date * 1000)}
    User Link: <a href="tg://user?id=${userInfo.id}">${userInfo.username}</a>

    CHAT INFO:
    Chat ID: ${message.chat.id}
    Chat Type: ${message.chat.type}
    Super Group Name: ${message.chat.title}
    Group Link: <a href="https://web.telegram.org/k/#${superId}">${message.chat.title}</a>
  `;
  await bot.telegram.sendMessage(adminId, info, {parse_mode: 'HTML'});
}



// Обработка сообщений
const handlers = {
  'supergroup': async (ctx, requestBody) => {
    //console.log('Supergroup handler called');
    if (tgBotSuperChats.includes(requestBody.message.chat.id.toString())) {
      //console.log('Supergroup check passed');
      await bot.handleUpdate(requestBody);
    } else {
      console.log('Supergroup check failed');
      await notifyAdmin(requestBody.message.from, requestBody.message);
    }
  },
  'private': async (ctx, requestBody) => {
    //console.log('Private handler called');
    if (tgBotChats.includes(requestBody.message.from.id.toString())) {
      //console.log('Private check passed');
      await bot.handleUpdate(requestBody);
    } else {
      console.log('Private check failed');
      await notifyAdmin(requestBody.message.from, requestBody.message);
      try {
        const errorMessage = 'Не для тебя моя роза цвела!';
        await bot.telegram.sendMessage(requestBody.message.chat.id, errorMessage);
      } catch (error) {
        const adminId = process.env.ADMIN_ID;
        info = JSON.stringify(error);
        await bot.telegram.sendMessage(adminId, info);
      }
    }
  }
};

module.exports.handler = async (event, context) => {
  try {
    const requestBody = JSON.parse(event.body);
    if (requestBody.my_chat_member) {
      // Do something
    } else if (requestBody.message && handlers[requestBody.message.chat.type]) {
      //console.log('Handler exists for this chat type');
      await handlers[requestBody.message.chat.type](context, requestBody);
    } else {
      console.log('No handler exists for this chat type');
    }
    
    return {
      statusCode: 200,
      body: 'ok',
    };
  } catch (error) {
    console.error(error);
    return {
      statusCode: 500,
      body: 'Internal Server Error',
    };
  }
};