const { Telegraf, Markup} = require('telegraf');
const OpenAI = require("openai");
const AWS = require('aws-sdk');

const bot = new Telegraf(process.env.TG_BOT_TOKEN);
const openai = new OpenAI({
    apiKey: process.env.PROXY_API_KEY, 
    baseURL: 'https://api.proxyapi.ru/openai/v1'
});

const s3 = new AWS.S3({
    accessKeyId: process.env.YANDEX_KEY_ID,
    secretAccessKey: process.env.YANDEX_KEY_SECRET,
    endpoint: 'https://storage.yandexcloud.net'
});

const yandexBucket = process.env.YANDEX_BUCKET;
const tgBotChats = process.env.TG_BOT_CHATS.toLowerCase().split(',');
const tgBotSuperChats = process.env.TG_BOT_SUPERCHATS.toLowerCase().split(',');

bot.start((ctx) => {
    ctx.reply("Привет! Я ChatGPT бот. Спроси меня что-нибудь!");
});

bot.command('new', (ctx) => {
  clearHistoryForChat(ctx.chat.id);
  ctx.reply('История чата очищена!');
});

bot.on('channel_post', async (ctx) => {
    // Обработка постов
});

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

async function textMessageForChannel(text, chatId) {
  const model = 'gpt-3.5-turbo';
  const prompt = 'Автор сообщения является начинающим музыкальным исполнителем Увер. Ты должен ответить на его сообщение и всячески его потдерживать и восхвалять.'; // Задаем промпт пользователя
  //const chatCompletion = await openai.chat.completions.create({ model, messages: history })
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

async function processTextMessage(text, chatId) {
  const model = 'gpt-3.5-turbo';
  
  let history = [];
  try {
    const historyObjectResponse = await s3.getObject({ Bucket: yandexBucket, Key: `${chatId}.json` }).promise();
    history = JSON.parse(historyObjectResponse.Body.toString());
  } catch (error) {
    console.error(error);
  }
  
  history.push({ role: 'user', content: text });
  
  try {
    const chatCompletion = await openai.chat.completions.create({ model, messages: history });
    const aiResponse = chatCompletion.choices[0].message.content;
    history.push({ role: 'assistant', content: aiResponse });
    
    await s3.putObject({ Bucket: yandexBucket, Key: `${chatId}.json`, Body: JSON.stringify(history) }).promise();
    
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

async function clearHistoryForChat(chatId) {
  try {
    await s3.putObject({ Bucket: yandexBucket, Key: `${chatId}.json`, Body: '[]' }).promise();
  } catch (error) {
    console.error(error);
  }
}

module.exports.handler = async (event, context) => {
  try {
    const requestBody = JSON.parse(event.body);
    //console.log(requestBody);
    if (requestBody.my_chat_member) {
      // Do something
    } else if (requestBody.message && requestBody.message.chat.type === 'supergroup') {
      //const super_id = requestBody.message.chat.id;
      //console.log(requestBody);
      if (tgBotSuperChats.includes(requestBody.message.chat.id.toString()))
        await bot.handleUpdate(requestBody);
      else {
        //const errorMessage = 'Не для тебя моя роза цвела!';
        //await bot.telegram.sendMessage(requestBody.message.chat.id, errorMessage);
      }
    } else if (requestBody.message && requestBody.message.from && requestBody.message.from.username && requestBody.message.chat.type === 'private') {
      const username = requestBody.message.from.username.toLowerCase();
      console.log(requestBody);
      if (tgBotChats.includes(username)) {
        await bot.handleUpdate(requestBody);
      } else {
        const errorMessage = 'Не для тебя моя роза цвела!';
        await bot.telegram.sendMessage(requestBody.message.chat.id, errorMessage);
      }
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
