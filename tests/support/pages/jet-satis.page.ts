import { expect, type Page } from '@playwright/test';

export const jetSatisUrunleri = {
  jetKasko: {
    ad: 'JetKasko',
    path: '/jet-satis/jet-kasko/',
    ekranGostergeSelector: '#IdentityNo'
  },
  jetIlkAtesKonut: {
    ad: 'Jet İlk Ateş Konut',
    path: '/jet-satis/jet-fire/',
    ekranGostergeMetni: 'Sigortalı Bilgileri'
  },
  jetDask: {
    ad: 'JetDASK',
    path: '/jet-satis/jet-dask/',
    ekranGostergeMetni: 'İşlem Tipi'
  },
  jetSaglik: {
    ad: 'JetSağlık',
    path: '/jet-satis/jet-saglik/',
    ekranGostergeMetni: 'Sigortalı Kimlik Tipi'
  },
  jetKonut: {
    ad: 'JetKonut',
    path: '/jet-satis/jet-konut/',
    ekranGostergeMetni: 'Riziko Adresi'
  },
  jetKobi: {
    ad: 'JetKobi',
    path: '/jet-satis/jet-kobi/',
    ekranGostergeMetni: 'İşçi Sayısı'
  },
  jetSeyahat: {
    ad: 'JetSeyahat',
    path: '/jet-satis/jet-seyahat/',
    ekranGostergeMetni: 'GİDİLECEK ÜLKE'
  },
  jetFerdiKaza: {
    ad: 'Jet Ferdi Kaza',
    path: '/jet-satis/jet-ferdi-kaza/',
    ekranGostergeMetni: 'TC Kimlik No'
  },
  jetNakliyat: {
    ad: 'JetNakliyat',
    path: '/jet-satis/jet-nakliyat/',
    ekranGostergeMetni: 'Poliçe Genel Bilgileri'
  },
  jetTrafik: {
    ad: 'JetTrafik',
    path: '/jet-satis/jet-trafik',
    ekranGostergeMetni: 'Poliçe Oluştur'
  },
  jetBasim: {
    ad: 'JetBasım',
    path: '/jet-satis/jet-basim/',
    ekranGostergeMetni: 'Sorgulama Tipi'
  }
} as const;

export type JetSatisUrunu = keyof typeof jetSatisUrunleri;

export class JetSatisPage {
  constructor(private readonly page: Page) {}

  async urunEkraniniAc(urun: JetSatisUrunu): Promise<void> {
    const tanim = jetSatisUrunleri[urun];

    await this.page.goto(tanim.path, {
      waitUntil: 'domcontentloaded',
      timeout: 45_000
    });

    const expectedPath = tanim.path.replace(/\/$/, '');
    await expect(this.page).toHaveURL((url) => url.pathname.replace(/\/$/, '') === expectedPath);
    if ('ekranGostergeSelector' in tanim) {
      await expect(this.page.locator(tanim.ekranGostergeSelector)).toBeVisible({
        timeout: 20_000
      });
    } else {
      await expect(this.page.locator('body')).toContainText(tanim.ekranGostergeMetni, {
        timeout: 20_000
      });
    }
  }
}
