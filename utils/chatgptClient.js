// utils/chatgptClient.js - New ChatGPT API client to replace Gemini
const OpenAI = require('openai');
require('dotenv').config();

class ChatGPTClient {
  constructor() {
    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  async callChatGPT(prompt, options = {}) {
    try {
      const {
        temperature = 0.2,
        maxTokens = 1500,
        model = 'gpt-4o-mini', // Cost-effective model
        timeout = 30000
      } = options;

      console.log(`Making ChatGPT API call with model: ${model}`);
      console.log(`Prompt length: ${prompt.length} characters`);

      const response = await this.client.chat.completions.create({
        model: model,
        messages: [
          {
            role: 'system',
            content: 'You are a JSON-only API. You must respond with ONLY valid JSON. Never include markdown, explanations, or text outside the JSON object.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: temperature,
        max_tokens: maxTokens,
        response_format: { type: 'json_object' }, // Forces JSON response
        timeout: timeout
      });

      const content = response.choices[0].message.content;

      console.log(`ChatGPT Response received. Length: ${content.length} characters`);
      console.log(`Tokens used: ${response.usage.total_tokens}`);

      return {
        text: content,
        usage: response.usage,
        model: response.model
      };

    } catch (error) {
      console.error('ChatGPT API Error:', error);

      if (error.code === 'rate_limit_exceeded') {
        throw new Error('Rate limit exceeded. Please try again later.');
      } else if (error.code === 'insufficient_quota') {
        throw new Error('API quota exceeded. Please check your billing.');
      } else if (error.code === 'invalid_api_key') {
        throw new Error('Invalid API key. Please check your OpenAI API key.');
      } else if (error.type === 'timeout') {
        throw new Error('Request timeout. Please try again.');
      } else {
        throw new Error(`ChatGPT API error: ${error.message}`);
      }
    }
  }
}

// Export function that matches your existing interface
async function callChatGPT(prompt, options = {}) {
  const client = new ChatGPTClient();
  return await client.callChatGPT(prompt, options);
}

module.exports = { callChatGPT, ChatGPTClient };