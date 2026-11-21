import { getApiErrorMessage } from '@edutrack/web-core/http';
import { ref } from 'vue';
import { toast } from 'vue-sonner';

import { downloadFile } from '@/api/helpers';

/** Saves a PDF from the API (report card, receipt), with a busy flag and an error toast. */
export function useDownload() {
  const busy = ref<string | null>(null);
  async function download(url: string, fallbackName: string, key = url) {
    busy.value = key;
    try {
      await downloadFile(url, fallbackName);
    } catch (e) {
      toast.error(getApiErrorMessage(e, 'We couldn’t download it. Try again.'));
    } finally {
      busy.value = null;
    }
  }
  return { busy, download };
}
