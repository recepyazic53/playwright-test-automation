# Test yapısı

`scenarios` altındaki spec dosyaları TEST ve CANLI için ortaktır. Ortam `TEST_ENV` ile seçilir; spec kopyalanmaz.

```text
tests/
├── scenarios/
│   ├── login/
│   ├── jet-kasko/
│   └── trafik/
├── support/
│   ├── flows/
│   └── pages/
└── birim/          # tarayıcısız koruma testleri (+ fixtures/: sahte değerli örnekler)
```

Test verisi dosyalarda DEĞİL, platform veritabanındadır (Nöbetçi; bkz. kök README). Spec'ler veriyi
`tests/support/test-data.ts` yükleyicileriyle (veritabanından) alır.

Yeni bir ürün testi eklerken spec içinde `testBaslangiciniHazirla` çağrılır, ardından ilgili Page Object ile ürün akışı yürütülür. Locator ve teknik beklemeler spec içine yazılmaz.
