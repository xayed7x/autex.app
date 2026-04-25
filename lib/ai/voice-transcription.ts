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
    // Facebook voice messages usually require the page access token
    const separator = audioUrl.includes('?') ? '&' : '?';
    const audioResponse = await fetch(`${audioUrl}${separator}access_token=${accessToken}`);
    
    const rawTranscript = await (audioResponse.ok 
      ? processAudioResponse(audioResponse)
      : processAudioResponse(await fetch(audioUrl, { headers: { 'Authorization': `Bearer ${accessToken}` } })));

    if (!rawTranscript) return null;

    // 2. Refine transcript with LLM (Step 2)
    console.log('✨ [WHISPER] Refining transcript with LLM...');
    const refinedTranscript = await refineTranscriptWithLLM(rawTranscript);
    
    return refinedTranscript;
  } catch (error) {
    console.error('❌ [WHISPER] Transcription error:', error);
    return null;
  }
}

async function processAudioResponse(response: Response): Promise<string | null> {
  const audioBlob = await response.blob();
  
  // 2. Prepare FormData for OpenAI
  const formData = new FormData();
  // OpenAI Whisper requires strict file extensions. .m4a is a supported container for AAC.
  const file = new File([audioBlob], 'audio.m4a', { type: 'audio/m4a' });
  formData.append('file', file);
  formData.append('model', 'whisper-1');
  // Note: OpenAI API currently returns an error if 'bn' is passed explicitly in the language parameter.
  // We rely on auto-detection + prompt to ensure Bengali transcription.
  formData.append('temperature', '0');
  formData.append('prompt', 'এটা একটা বাংলিশ কথোপকথন। কেক অর্ডার, ফ্লেভার এবং ডেলিভারি সম্পর্কে কথা হচ্ছে।');

  // 3. Call OpenAI Transcription API
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
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a professional transcription refiner. Your task is to clean up Bengali/Banglish transcripts. Remove filler words like "um", "ah", "ইয়ে", "মানে", and redundant repetitions. Fix broken sentences and grammar while strictly preserving the original meaning and emotional tone. Output ONLY the cleaned text.'
        },
        {
          role: 'user',
          content: `নিচের ট্রান্সক্রিপ্টটা গুছিয়ে লেখো, উম-আহ বাদ দাও, বাক্য ঠিক করো কিন্তু অর্থ চেঞ্জ কোরো না:\n\n${rawText}`
        }
      ],
      temperature: 0,
    });

    const refinedText = response.choices[0].message.content?.trim() || rawText;
    console.log('✅ [WHISPER] Refined Transcription:', refinedText);
    return refinedText;
  } catch (error) {
    console.error('❌ [WHISPER] LLM Refinement error:', error);
    return rawText; // Fallback to raw text if LLM fails
  }
}
