/**
 * Voice Transcription Utility
 * Uses OpenAI Whisper to transcribe audio files.
 */

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
    
    if (!audioResponse.ok) {
      console.error(`❌ [WHISPER] Failed to fetch audio from FB: ${audioResponse.statusText}`);
      // Try fallback with Authorization header if query param fails
      const retryResponse = await fetch(audioUrl, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      
      if (!retryResponse.ok) {
        console.error(`❌ [WHISPER] Fallback fetch also failed: ${retryResponse.statusText}`);
        return null;
      }
      return processAudioResponse(retryResponse);
    }

    return processAudioResponse(audioResponse);
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
  // Note: OpenAI reported 'bn' as unsupported in the language parameter.
  // We use the prompt to nudge Whisper toward Bengali while allowing auto-detection.
  formData.append('prompt', 'Bengali conversation about cake ordering, flavors, and delivery details. এই কথোপকথনটি কেক অর্ডার, ফ্লেভার এবং ডেলিভারি সম্পর্কে।');

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
  console.log('✅ [WHISPER] Transcription successful:', result.text);
  return result.text;
}
