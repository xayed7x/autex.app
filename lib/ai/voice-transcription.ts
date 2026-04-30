/**
 * Voice Transcription Utility
 * Uses OpenAI Whisper to transcribe audio files and LLM to refine the text.
 */

import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function transcribeVoiceMessage(
  audioUrl: string,
  accessToken: string
): Promise<string | null> {
  try {
    console.log('🎙️ [WHISPER] Starting transcription for:', audioUrl);

    // 1. Fetch audio from Facebook CDN
    const separator = audioUrl.includes('?') ? '&' : '?';
    const audioResponse = await fetch(`${audioUrl}${separator}access_token=${accessToken}`);
    
    const rawTranscript = await (audioResponse.ok 
      ? processAudioResponse(audioResponse)
      : processAudioResponse(await fetch(audioUrl, { headers: { 'Authorization': `Bearer ${accessToken}` } })));

    if (!rawTranscript) return null;

    // 2. Refine transcript with LLM (Step 2)
    console.log('✨ [WHISPER] Refining transcript with LLM...');
    const refinedTranscript = await refineTranscriptWithLLM(rawTranscript);

    // Handle [unclear] case
    if (refinedTranscript.trim() === '[unclear]') {
      console.log('⚠️ [WHISPER] Transcription is too unclear to process.');
      return null;
    }
    
    return refinedTranscript;
  } catch (error) {
    console.error('❌ [WHISPER] Transcription error:', error);
    return null;
  }
}

async function processAudioResponse(response: Response): Promise<string | null> {
  const audioBlob = await response.blob();
  
  const formData = new FormData();
  const file = new File([audioBlob], 'audio.m4a', { type: 'audio/m4a' });
  formData.append('file', file);
  formData.append('model', 'whisper-1');
  formData.append('temperature', '0');
  formData.append('prompt', 'বাংলা এবং বাংলিশ কথোপকথন। পোশাক অর্ডার, কেক অর্ডার, দাম জিজ্ঞেস, সাইজ, রং, ডেলিভারি, বিকাশ, নগদ সম্পর্কে কথা হচ্ছে। পুরো অডিওটি বিস্তারিতভাবে ট্রান্সক্রাইব করো, কোনো অংশ বাদ দিও না। সাধারণ শব্দ: ভাই, আপু, দাম কত, আছে, নাই, অর্ডার করব, কনফার্ম, পাঠান, L সাইজ, M সাইজ, লাল, নীল, সাদা, কালো।');

  const openaiResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: formData,
  });

  if (!openaiResponse.ok) {
    const errorData = await openaiResponse.json();
    console.error('❌ [WHISPER] OpenAI API error:', errorData);
    return null;
  }

  const result = await openaiResponse.json();
  console.log('✅ [WHISPER] Raw Transcription:', result.text);
  return result.text;
}

/**
 * Step 2: LLM Clean-up
 * Refines the raw transcript to remove filler words and fix grammar.
 */
async function refineTranscriptWithLLM(rawText: string): Promise<string> {
  try {
    // PRE-PROCESS: Remove common Whisper stuttering artifacts (e.g., "কুরোরোরোরো...")
    // This happens when Whisper hallucinates on silence/noise
    let preProcessedText = rawText.replace(/(.)\1{4,}/g, '$1'); 
    
    // Also remove repeating word sequences
    preProcessedText = preProcessedText.replace(/(\b\w+\b)( \1){3,}/g, '$1');

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `তুমি একটা Senior Bangla Voice Editor। তোমার কাজ হলো Whisper এর ভুলভাল বা 'stuttering' (তোতলামি) যুক্ত ট্রান্সক্রিপ্ট ঠিক করা।
          
নিয়ম:
1. Whisper অনেক সময় শেষে একই অক্ষর বারবার লেখে (যেমন: কুরোরোরো...)। এগুলো বাদ দাও।
2. যদি শব্দগুলো ভুল হয় কিন্তু উচ্চারণ কাছাকাছি হয়, তবে সঠিক শব্দে রূপান্তর করো (যেমন: 'অচ্ছে' → 'আচ্ছা', 'আমে' → 'আমি', 'ওডের' → 'অর্ডার')।
3. 'ইয়ে', 'মানে', 'উম', 'আহ' — এগুলো remove করো।
4. Product names, sizes (L, M, XL) এবং পেমেন্ট মেথড (bKash, Nagad) ঠিক রাখো।
5. **চেষ্টা করো**: যদি বাক্যটি পুরোপুরি ভাঙাচোরা হয় কিন্তু ২-৩টি মূল শব্দ (যেমন: অর্ডার, দাম, কালার) বোঝা যায়, তবে সেগুলো দিয়ে একটি অর্থপূর্ণ বাক্য তৈরির চেষ্টা করো। 
6. অডিওটি লম্বা হলে সবটুকু তথ্য বজায় রাখার চেষ্টা করো, কোনো অংশ বাদ দিও না।
7. একদমই যদি কোনো অর্থ উদ্ধার করা অসম্ভব হয়, তবেই শুধু '[unclear]' লিখবে।

Output: শুধু পরিষ্কার বাংলা টেক্সট।`
        },
        {
          role: 'user',
          content: `নিচের ভাঙাচোরা ট্রান্সক্রিপ্টটা ঠিক করে সুন্দর করে লেখো:\n\n${preProcessedText}`
        }
      ],
      temperature: 0,
      max_tokens: 500,
    });

    const refinedText = response.choices[0].message.content?.trim() || preProcessedText;
    console.log('✅ [WHISPER] Refined Transcription:', refinedText);
    return refinedText;
  } catch (error) {
    console.error('❌ [WHISPER] LLM Refinement error:', error);
    return rawText; 
  }
}
