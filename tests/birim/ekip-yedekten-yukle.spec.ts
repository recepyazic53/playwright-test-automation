// KORUMA TESTLERİ — ilk kurulumda "Yedekten yükle": kullanıcı adı yedeğin ekip listesinde değilse hiçbir şey hazırlanmaz (YETKISIZ);
// listedeyse (büyük / küçük harf yok sayılır) ya da yedekte ekip yoksa yükleme sürer.
import { expect, test } from '@playwright/test';
import { veritabaniAc } from '../../scripts/platform/veritabani/baglanti.mjs';
import { gocleriUygula } from '../../scripts/platform/veritabani/gocler.mjs';
import { KasaHatasi, kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { yedekOlustur } from '../../scripts/platform/yedek.mjs';
import { hazirligiAt, iceAktarmaHazirla } from '../../scripts/platform/ice-aktarma.mjs';
import { ekipUyeleriKaydet } from '../../scripts/platform/ekip.mjs';
import { HIZLI_KDF } from './platform-ortak';

const PAROLA = 'Gecici-Ekip-Yedek-1';

async function kaynakVt(ekipli: boolean) {
  const vt = await veritabaniAc(null);
  gocleriUygula(vt);
  await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
  if (ekipli) ekipUyeleriKaydet(vt, [{ ad: 'Ayşe', rol: 'admin' }, { ad: 'Mehmet', rol: 'kullanici' }], '');
  return vt;
}

const kod = (e: unknown) => (e instanceof KasaHatasi ? e.kod : String(e));

test('yedekten yükle: ekip listesindeki ad geçer, olmayan / boş ad YETKISIZ; ekipsiz yedekte denetim yok', async () => {
  const ekipli = await kaynakVt(true);
  const ekipsiz = await kaynakVt(false);
  try {
    const yedek = yedekOlustur(ekipli).veri;
    expect(await iceAktarmaHazirla(null, yedek, PAROLA, { kullaniciAdi: 'Ali' }).catch(kod)).toBe('YETKISIZ');
    expect(await iceAktarmaHazirla(null, yedek, PAROLA, { kullaniciAdi: '' }).catch(kod)).toBe('YETKISIZ');
    hazirligiAt(await iceAktarmaHazirla(null, yedek, PAROLA, { kullaniciAdi: ' mehmet ' }));
    // Ad verilmeyen (Ayarlar'dan içe aktarma) yol denetlenmez.
    hazirligiAt(await iceAktarmaHazirla(null, yedek, PAROLA));
    hazirligiAt(await iceAktarmaHazirla(null, yedekOlustur(ekipsiz).veri, PAROLA, { kullaniciAdi: 'Ali' }));
  } finally {
    ekipli.kapat();
    ekipsiz.kapat();
  }
});
