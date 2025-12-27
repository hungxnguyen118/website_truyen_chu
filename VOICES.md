# Voice Selection Guide

## Current TTS Engine: gTTS (Google Text-to-Speech)

The current implementation uses **gTTS**, which has **limited voice selection**. It primarily supports different **language codes** and **accents**, but not custom voice names.

### Available Options for Vietnamese:

- **`vi`** (default): Vietnamese voice - Google's default Vietnamese TTS voice

### Language Code Variants:

gTTS supports language codes with regional variants. For example:
- `en-us` - English (US accent)
- `en-gb` - English (UK accent)  
- `es-es` - Spanish (Spain)
- `es-us` - Spanish (US)

However, for Vietnamese (`vi`), gTTS only provides the default voice.

## How to Use:

### Basic Usage (Default Vietnamese Voice):
```bash
node tts.js convert pham-nhan-tu-tien 1
```

### With Slow Speed:
```bash
node tts.js convert pham-nhan-tu-tien 1 --slow
```

### List Available Voices:
```bash
node tts.js convert pham-nhan-tu-tien 1 --list-voices
```

## Limitations of gTTS:

- ❌ No custom voice selection for Vietnamese
- ❌ Limited to one default voice per language
- ✅ Free to use (no API key required)
- ✅ Works offline after initial download

## Alternative TTS Services (More Voice Options):

If you need more voice options, consider these services:

### 1. Google Cloud Text-to-Speech API
- **Pros**: Many Vietnamese voices (male/female, different styles)
- **Cons**: Requires API key, paid service (free tier available)
- **Voices**: 
  - `vi-VN-Standard-A` (Female)
  - `vi-VN-Standard-B` (Male)
  - `vi-VN-Standard-C` (Female)
  - `vi-VN-Standard-D` (Male)
  - `vi-VN-Wavenet-A` (Female, Neural)
  - `vi-VN-Wavenet-B` (Male, Neural)
  - `vi-VN-Wavenet-C` (Female, Neural)
  - `vi-VN-Wavenet-D` (Male, Neural)

### 2. Azure Cognitive Services
- **Pros**: Multiple Vietnamese voices, good quality
- **Cons**: Requires API key, paid service
- **Voices**: Multiple male/female Vietnamese voices

### 3. Amazon Polly
- **Pros**: Multiple voices, good quality
- **Cons**: Requires AWS account, paid service
- **Voices**: Limited Vietnamese support

## Future Enhancement:

To add support for Google Cloud TTS or other services with more voice options, you would need to:
1. Install the service SDK (e.g., `@google-cloud/text-to-speech`)
2. Set up API credentials
3. Modify the `textToSpeech` function to use the new service
4. Add voice selection parameters

Would you like me to implement support for Google Cloud TTS with voice selection?

