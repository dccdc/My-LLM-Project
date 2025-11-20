import { google } from '@ai-sdk/google';
import { generateText } from 'ai';


export async function POST(req: Request) {
    const { topic } = await req.json();
    
    const result = await generateText({
        model: google('gemini-2.5-pro'),
        system: `你是一名中国电商资深文案，擅长天猫、抖音、小红书、微信生态的促销转化。\n品牌：优衣库。调性：简洁、实用、亲和、可信；突出功能与性价比，避免夸张与虚假承诺。\n禁用词：全网最低/永久/百分百/治愈/神器等极限或医疗功效词；避免侵犯他人商标与不实对比。\n风格基准：简洁标题＋明确利益点＋可信证据（材质/工艺/数据来源）＋明确优惠机制＋稀缺/时限提醒。\n输出中文，面向双11场景，适配中国消费者表达习惯。`,
        prompt: `给${topic}新品推出，提供一个文案创意，包括标题、卖点、优惠、行动号召等。`
      });

  return new Response(result.text);
}

