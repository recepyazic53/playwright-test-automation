# Testler

```text
tests/
├── model-kosucu/model-senaryolari.spec.ts   # Nöbetçi'deki her senaryo için bir test üretir (ekran modeliyle koşar)
├── support/                                 # Model koşucusu, giriş motoru, veri erişimi (genel-veri.ts), raporlayıcı
└── birim/                                   # Koruma testleri (playwright.birim.config.ts; yerel sahte uygulamalar)
```

Senaryo verisi dosyalarda DEĞİL, Nöbetçi'nin şifreli veritabanındadır. Model spec'i koşuyu başlatan Nöbetçi'den gelen
proje ve ortam kimlikleriyle (NOBETCI_PROJE_ID / NOBETCI_ORTAM_ID) veriyi okur; bu yüzden tek başına terminalden
çalıştırılmaz.

Koruma testleri: `npm test` (tarayıcıyla yalnızca 127.0.0.1'deki sahte uygulamalara bağlanır). Uçtan uca model koşusu
testi isteğe bağlıdır: `MODEL_UCTAN_UCA=1 npx playwright test --config playwright.birim.config.ts model-kosucu-uctan-uca`.
