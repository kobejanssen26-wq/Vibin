/**
 * Offline geocoder for Belgian places — framework-free, shared by the Worker and
 * the client. Lets the group "location + radius" filter work without an external
 * geocoding API: a locality name or 4-digit postcode resolves to an approximate
 * coordinate.
 *
 * PLACE_DATA / POSTCODE_DATA are GENERATED from the public "zipcode-belgium"
 * dataset (~2700 localities — every one of the 581 municipalities plus
 * deelgemeenten / sections). Run `node scripts/gen-be-places.mjs` to refresh.
 * Coordinates are locality centres rounded to 4 decimals (~11 m), precision
 * enough for a "within X km" filter. Unknown input resolves to `null`.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

/** "<normalised name>:<lat>,<lng>" per line — parsed once at module load. */
const PLACE_DATA = `aaigem:50.8894,3.9367
aalbeke:50.7775,3.2186
aalst:50.7814,5.2128
aalter:51.0882,3.4177
aarschot:50.9842,4.8246
aarsele:50.9972,3.414
aartrijke:51.118,3.0913
aartselaar:51.1333,4.387
abee:50.4735,5.3565
abolens:50.6721,5.1498
achel:51.2684,5.4793
achene:50.2669,5.0459
achet:50.3335,5.1752
acosse:50.5946,5.0486
acoz:50.3588,4.5324
adegem:51.2035,3.4858
adinkerke:51.0693,2.5896
affligem:50.9035,4.1175
afsnee:51.03,3.6575
agimont:50.1642,4.7943
aineffe:50.623,5.2562
aische en refail:50.5989,4.836
aiseau:50.4111,4.587
aiseau presles:50.4065,4.5841
aisemont:50.4049,4.6513
alken:50.8755,5.308
alle:49.8421,4.9727
alleur:50.6743,5.513
alsemberg:50.7449,4.3282
alveringem:51.0151,2.7226
amay:50.5498,5.3241
amberloup:50.0293,5.5273
ambleve:50.3543,6.1706
ambly:50.1442,5.3142
ambresin:50.6267,5.0305
amonines:50.2655,5.5572
amougies:50.7437,3.5067
ampsin:50.5402,5.2867
andenne:50.4901,5.1044
anderlecht:50.8381,4.3123
anderlues:50.408,4.2696
andrimont:50.4387,5.8902
angleur:50.6128,5.5954
angre:50.367,3.6955
angreau:50.3509,3.6911
anhee:50.3108,4.8797
anlier:49.7721,5.6204
anloy:49.9499,5.2216
annevoie rouillon:50.3431,4.8419
ans:50.6624,5.5191
anseremme:50.2379,4.9079
anseroeul:50.728,3.5206
anthee:50.2395,4.7604
antheit:50.5512,5.2359
anthisnes:50.4817,5.5225
antoing:50.5659,3.4513
antwerpen:51.2211,4.3997
anvaing:50.6818,3.5617
anzegem:50.844,3.4637
appels:51.0298,4.0562
appelterre eichem:50.8191,3.9673
arbre:50.3655,4.8206
arbrefontaine:50.3013,5.8354
arc wattripont:50.7283,3.549
archennes:50.7516,4.6702
ardooie:50.9708,3.2046
arendonk:51.3202,5.0865
argenteau:50.6958,5.686
arlon:49.6828,5.8119
arquennes:50.564,4.2875
arsimont:50.4273,4.6388
arville:50.0324,5.3167
as:51.0005,5.5722
aspelare:50.8422,3.9584
asquillies:50.402,3.9571
asse:50.9136,4.1804
assebroek:51.1933,3.2571
assenede:51.23,3.7568
assenois:49.803,5.4625
assent:50.9468,5.0137
assesse:50.3704,5.0234
astene:50.9846,3.5628
ath:50.6395,3.7927
athis:50.3648,3.7761
athus:49.5642,5.8318
attenhoven:50.7654,5.1007
attenrode:50.8695,4.9168
attert:49.7515,5.7872
attre:50.6102,3.8411
aubange:49.5675,5.8044
aubechies:50.5739,3.6769
aubel:50.7041,5.8586
aublain:50.0672,4.409
auby sur semois:49.8157,5.1824
auderghem:50.8157,4.4331
audregnies:50.383,3.7178
aulnois:50.3408,3.9032
autelbas:49.65,5.8676
autre eglise:50.6632,4.9249
autreppe:50.3463,3.7317
auvelais:50.447,4.6355
ave et auffe:50.112,5.1531
avekapelle:51.0631,2.7458
avelgem:50.7755,3.4469
avennes:50.6288,5.116
averbode:51.0278,4.9771
avernas le bauduin:50.6946,5.0789
avin:50.6209,5.0677
awans:50.667,5.462
awenne:50.0742,5.3062
awirs:50.5985,5.4093
aye:50.2233,5.2931
ayeneux:50.6088,5.7147
aywaille:50.4735,5.6742
baaigem:50.931,3.7219
baal:51.0075,4.7505
baardegem:50.956,4.14
baarle hertog:51.4128,4.9004
baasrode:51.0399,4.1444
bachte maria leerne:51.0038,3.5624
baelen:50.6312,5.9715
bagimont:49.8242,4.8751
baileux:50.0299,4.3755
bailievre:50.0693,4.2386
baillamont:49.8994,5.0268
bailleul:50.6689,3.3176
baillonville:50.2888,5.3382
baisieux:50.3879,3.6958
baisy thy:50.604,4.4881
balatre:50.4983,4.6382
balegem:50.9252,3.7896
balen:51.1718,5.1938
bambrugge:51.0546,3.4154
bande:50.1666,5.4155
barbencon:50.2207,4.2859
barchon:50.6682,5.6969
baronville:50.1262,4.9469
barry:50.5875,3.5431
barvaux condroz:50.3291,5.2607
bas oha:50.5224,5.1881
bas warneton:50.7588,2.9625
basecles:50.5252,3.6472
basse bodeux:50.358,5.8268
bassenge:50.7584,5.6095
bassevelde:51.2312,3.679
bassilly:50.6724,3.936
bastogne:50.001,5.7153
batsheers:50.7382,5.2808
battice:50.6483,5.8195
battignies:50.4165,4.1686
baudour:50.4814,3.8328
bauffe:50.5701,3.8537
baugnies:50.5616,3.5522
baulers:50.6172,4.3586
bavegem:50.945,3.868
bavikhove:50.879,3.3126
bazel:51.1469,4.2874
beaufays:50.559,5.6388
beaumont:50.2355,4.2383
beauraing:50.1105,4.9576
beausaint:50.1703,5.5533
beauvechain:50.781,4.7717
beauwelz:50.0154,4.157
beclers:50.6218,3.5029
beek:51.1661,5.6378
beerlegem:50.9027,3.7198
beernem:51.1277,3.3145
beerse:51.3135,4.8376
beersel:50.7684,4.3051
beerst:51.0537,2.8732
beert:50.7355,4.1853
beervelde:51.0802,3.8793
beerzel:51.063,4.6631
beez:50.4687,4.922
beffe:50.2454,5.5231
begijnendijk:51.0242,4.7826
beho:50.2204,5.9973
beigem:50.9527,4.3639
bekegem:51.1489,3.0582
bekkerzeel:50.8854,4.2382
bekkevoort:50.9339,4.9846
belgrade:50.4692,4.8223
bellaire:50.6447,5.6655
bellecourt:50.4843,4.254
bellefontaine:49.9177,4.9731
bellegem:50.7782,3.28
bellem:51.0903,3.4995
bellevaux:50.3913,6.013
bellingen:50.7378,4.1601
beloeil:50.5479,3.7361
belsele:51.157,4.0918
ben ahin:50.5033,5.1773
bende:50.4176,5.4142
berbroek:50.9488,5.2099
berchem:51.1918,4.4317
berchem sainte agathe:50.864,4.2927
berendrecht:51.3455,4.3194
berg:51.1696,5.1521
bergilers:50.7145,5.3277
beringen:51.0502,5.2208
berlaar:51.103,4.664
berlare:51.0302,4.0113
berlingen:50.8234,5.3112
berloz:50.6977,5.2146
berneau:50.7423,5.7313
bernissart:50.4755,3.6505
bersillies l abbaye:50.2632,4.1521
bertem:50.8706,4.6323
bertogne:50.0843,5.6676
bertree:50.6942,5.0896
bertrix:49.8547,5.2529
berzee:50.2892,4.4012
beselare:50.8505,3.0293
betekom:50.996,4.7908
bettincourt:50.71,5.2354
beuzet:50.533,4.7482
bevel:51.1364,4.6923
beverce:50.4415,6.0392
bevere:50.8514,3.5956
beveren:50.8717,3.3427
beverlo:51.0897,5.2444
beverst:50.8922,5.4735
beyne heusay:50.6221,5.6534
bienne lez happart:50.3512,4.2156
bierbeek:50.8241,4.7714
biercee:50.3251,4.2591
bierges:50.7112,4.5894
bierghes:50.6966,4.1227
bierset:50.6547,5.4513
bierwart:50.5581,5.0361
biesme:50.3346,4.6073
biesme sous thuin:50.3207,4.308
biesmeree:50.2974,4.6804
bievene:50.7164,3.9431
bievre:49.9411,5.0168
biez:50.7267,4.7034
bihain:50.239,5.8082
bikschote:50.925,2.8631
bilstain:50.6235,5.9212
bilzen:50.8713,5.5163
binche:50.4128,4.1702
binderveld:50.8655,5.1684
binkom:50.8721,4.8909
bioul:50.3336,4.7976
bissegem:50.8228,3.2285
bizet:50.7061,2.89
blaasveld:51.0565,4.3724
blaimont:50.1922,4.8353
blandain:50.625,3.3035
blanden:50.8282,4.7057
blankenberge:51.3165,3.1298
blaregnies:50.3578,3.898
blaton:50.5012,3.6612
blaugies:50.373,3.8051
blegny:50.6727,5.7252
bleharies:50.5131,3.4155
blehen:50.6629,5.1255
bleid:49.568,5.6273
bleret:50.6893,5.2889
blicquy:50.5878,3.6858
bocholt:51.1925,5.5996
bodegnee:50.5858,5.3041
boechout:51.1597,4.5104
boekhout:50.7456,5.2314
boekhoute:51.2509,3.706
boelhe:50.6842,5.1679
boezinge:50.8933,2.8624
bogaarden:50.7398,4.1368
bohan:49.8642,4.886
boignee:50.5018,4.612
boirs:50.7539,5.5789
bois d haine:50.5023,4.2157
bois de lessines:50.6953,3.8856
bois de villers:50.39,4.8234
bois et borsu:50.3946,5.3303
bolinne:50.6003,4.93
bolland:50.6614,5.7594
bomal:50.6681,4.8735
bomal sur ourthe:50.376,5.5224
bombaye:50.7302,5.7429
bommershoven:50.7852,5.3824
bon secours:50.4976,3.6075
boncelles:50.5743,5.5356
boneffe:50.6239,4.9575
bonheiden:51.0261,4.5378
boninne:50.4924,4.9292
bonlez:50.7021,4.6896
bonnert:49.7108,5.819
bonneville:50.4709,5.0339
bonsin:50.3727,5.3789
booischot:51.0472,4.7693
booitshoeke:51.0883,2.74
boom:51.0874,4.3667
boorsem:50.9409,5.7147
boortmeerbeek:50.9783,4.5758
borchtlombeek:50.8482,4.1369
borgerhout:51.2103,4.4404
borgloon:50.8004,5.357
borlez:50.633,5.2451
borlo:50.7345,5.1744
borlon:50.3784,5.4049
bornem:51.0925,4.2423
bornival:50.6049,4.2649
borsbeek:51.1929,4.489
borsbeke:50.9047,3.8946
bossiere:50.5234,4.692
bossuit:50.748,3.4081
bossut gottechain:50.7616,4.6991
bost:50.7846,4.9339
bothey:50.5218,4.6525
bottelare:50.9635,3.7553
bouffioulx:50.3902,4.5152
bouge:50.4789,4.8917
bougnies:50.3868,3.9392
bouillon:49.795,5.0673
bourlers:50.0274,4.3413
bourseigne neuve:50.0251,4.855
bourseigne vieille:50.0221,4.8712
boussoit:50.4588,4.082
boussu:50.4331,3.7961
boussu en fagne:50.0755,4.471
boussu lez walcourt:50.2263,4.3768
bousval:50.6321,4.5192
boutersem:50.8473,4.8336
bouvignes sur meuse:50.2726,4.8984
bouvignies:50.6477,3.7677
bouwel:51.1621,4.7371
bovekerke:51.0562,2.9633
bovelingen:50.7376,5.2552
bovenistier:50.6675,5.2843
bovesse:50.5144,4.7787
bovigny:50.2244,5.9182
bra:50.3209,5.7309
braffe:50.5524,3.5829
braibant:50.3129,5.063
braine l alleud:50.6941,4.3548
braine le chateau:50.6809,4.2667
braine le comte:50.6123,4.1425
braives:50.6301,5.1435
brakel:50.798,3.7628
branchon:50.6297,4.972
bras:49.976,5.3878
brasmenil:50.5417,3.5473
brasschaat:51.2931,4.4893
bray:50.43,4.1025
brecht:51.3348,4.5972
bredene:51.2389,2.9726
bree:51.1386,5.623
breendonk:51.0453,4.3136
bressoux:50.6413,5.6111
brielen:50.8689,2.8475
broechem:51.1814,4.5967
broekom:50.7819,5.3325
brugelette:50.5954,3.8547
brugge:51.2147,3.2074
bruly:49.9696,4.5297
bruly de pesche:50.0009,4.4603
brunehaut:50.5178,3.3796
brussegem:50.9278,4.2659
brustem:50.7991,5.2303
bruxelles:50.8466,4.3517
bruyelle:50.5574,3.427
brye:50.5301,4.5614
budingen:50.8653,5.0871
buggenhout:51.0113,4.1928
buissenal:50.6649,3.6551
buissonville:50.2172,5.1959
buizingen:50.7379,4.2605
buken:50.9375,4.6174
bullange:50.4076,6.2578
bulskamp:51.0445,2.6434
bunsbeek:50.851,4.9601
burcht:51.2028,4.3416
burdinne:50.5813,5.0724
bure:50.0885,5.2612
burg reuland:50.1748,6.1217
burst:50.9137,3.9204
bury:50.5426,3.5946
butgenbach:50.4267,6.2054
buvingen:50.7502,5.1789
buvrinnes:50.3898,4.2055
buzenol:49.6479,5.5942
buzet:50.5389,4.3713
callenelle:50.5297,3.5253
calonne:50.5783,3.4372
cambron casteau:50.5886,3.8807
cambron saint vincent:50.5828,3.9162
carlsbourg:49.8948,5.0831
carnieres:50.443,4.2542
casteau:50.513,4.0031
castillon:50.2473,4.3528
celles:50.6539,5.2455
cerexhe heuseux:50.6509,5.7262
cerfontaine:50.1688,4.4126
ceroux mousty:50.6626,4.5292
chaineux:50.6319,5.8343
chairiere:49.8612,4.949
champion:50.4986,4.9035
champlon:50.1078,5.5034
chanly:50.0787,5.156
chantemelle:49.6535,5.6551
chapelle a oie:50.5968,3.6709
chapelle a wattines:50.6125,3.6551
chapelle lez herlaimont:50.4713,4.2804
chapon seraing:50.6097,5.2734
charleroi:50.4157,4.4492
charneux:50.6691,5.8048
chassepierre:49.7077,5.2622
chastre:50.6081,4.6367
chastre villeroux blanmont:50.6106,4.6378
chastres:50.2649,4.4592
chatelet:50.4046,4.5244
chatelineau:50.4156,4.5179
chatillon:49.6256,5.6984
chaudfontaine:50.5848,5.647
chaumont gistoux:50.684,4.6974
chaussee notre dame louvignies:50.5922,3.998
chenee:50.6111,5.6193
cherain:50.1807,5.8647
cheratte:50.6828,5.6702
chercq:50.5886,3.4213
chevetogne:50.2238,5.1188
chevron:50.382,5.7299
chievres:50.5877,3.8101
chimay:50.0479,4.3173
chiny:49.7386,5.3394
chokier:50.5936,5.4529
ciergnon:50.1666,5.0899
ciney:50.295,5.0974
ciplet:50.6171,5.0953
ciply:50.4193,3.9438
clabecq:50.6894,4.2214
clavier:50.4115,5.3576
clermont:50.659,5.8837
clermont sous huy:50.569,5.3922
cognelee:50.5172,4.9127
colfontaine:50.4057,3.8514
comblain au pont:50.4749,5.5765
comblain fairon:50.4454,5.5429
comblain la tour:50.4553,5.57
comines:50.7687,2.9987
comines warneton:50.7712,3.0019
conneux:50.2496,5.0604
corbais:50.6492,4.6408
corbion:49.7976,5.0065
cordes:50.6882,3.5343
corenne:50.252,4.6793
cornesse:50.5748,5.7911
cornimont:49.8626,4.998
corroy le chateau:50.536,4.6547
corroy le grand:50.6617,4.6747
corswarem:50.7096,5.2132
cortil noirmont:50.5908,4.6407
cortil wodon:50.5673,4.9584
couillet:50.3912,4.4686
cour sur heure:50.2975,4.3869
courcelles:50.4602,4.3763
courriere:50.3783,4.9845
court saint etienne:50.6443,4.5686
couthuin:50.5332,5.1319
coutisse:50.4637,5.117
couture saint germain:50.6628,4.4826
couvin:50.0525,4.4955
cras avernas:50.6979,5.1228
crehen:50.6606,5.0621
crisnee:50.7159,5.3973
croix lez rouveroy:50.3609,4.0759
crombach:50.2591,6.0681
crupet:50.3469,4.9581
cuesmes:50.4362,3.9207
cugnon:49.802,5.2033
cul des sarts:49.9615,4.455
custinne:50.2118,5.0484
dadizele:50.8469,3.1057
dailly:50.0578,4.4361
daknam:51.128,3.9809
dalhem:50.7139,5.723
damme:51.2553,3.2921
dampicourt:49.5553,5.498
dampremy:50.4186,4.4322
darion:50.6649,5.187
daussois:50.2188,4.4554
daussoulx:50.5172,4.877
dave:50.4111,4.9043
daverdisse:50.0218,5.1185
de haan:51.2415,3.0049
de klinge:51.2565,4.0898
de moeren:51.0359,2.5954
de panne:51.0944,2.5807
de pinte:50.9924,3.6496
deerlijk:50.8388,3.3623
deftinge:50.7864,3.8409
deinze:50.9841,3.5274
denderbelle:51.0011,4.0954
denderhoutem:50.8781,4.0059
denderleeuw:50.8844,4.0665
dendermonde:51.0312,4.0981
denderwindeke:50.7986,4.0241
denee:50.318,4.7513
dentergem:50.9661,3.4023
dergneau:50.7126,3.5666
dessel:51.2396,5.1132
desselgem:50.883,3.3669
destelbergen:51.0556,3.7979
desteldonk:51.1222,3.7836
deurle:51.0001,3.6112
deurne:51.2115,4.4695
deux acren:50.7307,3.8522
dhuy:50.5597,4.8574
diegem:50.8946,4.4365
diepenbeek:50.9078,5.42
diest:50.9846,5.0529
diets heur:50.745,5.4844
dikkebus:50.8192,2.831
dikkele:50.9035,3.7419
dikkelvenne:50.9177,3.6894
diksmuide:51.0333,2.8647
dilbeek:50.8441,4.2657
dilsen:51.0329,5.6991
dilsen stokkem:51.0285,5.7311
dinant:50.2608,4.9124
dion:50.1178,4.8884
dion valmont:50.7159,4.6615
dison:50.6114,5.8547
dochamps:50.2342,5.623
doel:51.3181,4.2456
dohan:49.7974,5.1419
doische:50.1357,4.7458
dolembreux:50.5376,5.628
donceel:50.6479,5.3199
dongelberg:50.7016,4.8203
donk:50.9582,4.9054
donstiennes:50.2854,4.312
dorinne:50.3173,4.9733
dormaal:50.8063,5.092
dottignies:50.7274,3.3037
dour:50.3979,3.7807
dourbes:50.0914,4.5915
dranouter:50.7663,2.7833
drehance:50.2368,4.9388
driekapellen:50.706,3.9855
drieslinter:50.8449,5.0533
drogenbos:50.7865,4.3174
drongen:51.0529,3.6395
dudzele:51.2747,3.2292
duffel:51.0957,4.5062
duisburg:50.8111,4.5452
duras:50.8341,5.1462
durbuy:50.3524,5.4562
durnal:50.3381,4.9857
dworp:50.7342,4.295
eben emael:50.7994,5.6702
ebly:49.8509,5.5349
ecaussinnes:50.5696,4.1752
ecaussinnes d enghien:50.5715,4.1776
ecaussinnes lalaing:50.5704,4.1786
edegem:51.1575,4.4384
edelare:50.8317,3.6282
eeklo:51.1845,3.5666
eernegem:51.1282,3.0231
egem:51.021,3.2541
eggewaartskapelle:51.0495,2.7298
eghezee:50.5917,4.905
ehein:50.5445,5.4444
eigenbilzen:50.8744,5.5756
eindhout:51.1017,4.9973
eine:50.8695,3.6226
eisden:50.9863,5.7129
eke:50.9569,3.6418
ekeren:51.2842,4.4323
eksaarde:51.1488,3.9652
eksel:51.1568,5.344
elen:51.0694,5.7404
elene:50.8908,3.8078
elewijt:50.9695,4.5076
eliksem:50.7871,5.0075
elingen:50.7794,4.1742
ellemelle:50.4664,5.4429
ellezelles:50.7339,3.6802
ellignies lez frasnes:50.6748,3.5904
ellikom:51.1303,5.5289
elouges:50.4037,3.7521
elsegem:50.8247,3.5366
elsenborn:50.4573,6.2214
elst:50.7686,5.5556
elverdinge:50.8812,2.8086
elversele:51.1202,4.1458
emblem:51.1626,4.6047
embourg:50.5894,5.6192
emelgem:50.9337,3.2213
emines:50.5157,4.828
emptinne:50.3254,5.1213
ename:50.8553,3.6318
engelmanshoven:50.7728,5.2518
enghien:50.6928,4.0407
engis:50.5824,5.4043
enines:50.6943,4.9261
ensival:50.5822,5.8432
epinois:50.405,4.2094
eppegem:50.9614,4.4557
eprave:50.1503,5.1714
erbaut:50.5331,3.8844
erbisoeul:50.5155,3.8961
ere:50.5822,3.3668
erembodegem:50.9161,4.0574
erezee:50.2931,5.5597
ermeton sur biert:50.2975,4.7198
ernage:50.5942,4.674
erneuville:50.1138,5.5508
ernonheid:50.4029,5.666
erondegem:50.9407,3.9555
erpe:50.9333,3.9766
erpe mere:50.9226,3.946
erpent:50.4474,4.9095
erpion:50.2119,4.3512
erps kwerps:50.9105,4.5751
erquelinnes:50.3102,4.1241
erquennes:50.359,3.7933
ertvelde:51.1794,3.7472
erwetegem:50.8558,3.8142
escanaffles:50.7546,3.4486
esen:51.0208,2.8991
esneux:50.5337,5.5758
espierres:50.7257,3.3465
espierres helchin:50.7257,3.3465
esplechin:50.5744,3.3038
esquelmes:50.6651,3.3478
essen:51.4678,4.4701
essene:50.8974,4.139
estaimbourg:50.6826,3.3181
estaimpuis:50.706,3.264
estinnes:50.3977,4.0976
estinnes au mont:50.3952,4.0989
estinnes au val:50.4128,4.1065
etalle:49.673,5.5982
ethe:49.5814,5.5767
etikhove:50.8129,3.626
ettelgem:51.1977,3.0385
etterbeek:50.8369,4.3895
eugies:50.3907,3.8884
eupen:50.6306,6.0315
evegnee:50.6418,5.7061
evelette:50.4136,5.1714
everbeek:50.7686,3.786
everberg:50.8727,4.5546
evere:50.8705,4.4022
evergem:51.1088,3.7079
evregnies:50.7131,3.2875
evrehailles:50.3203,4.9126
eynatten:50.6936,6.0817
ezemaal:50.7766,4.9973
fagnolle:50.105,4.5704
faimes:50.6652,5.2623
falaen:50.2782,4.7934
falisolle:50.4182,4.6213
fallais:50.6093,5.1738
falmagne:50.2003,4.8971
falmignoul:50.2038,4.8924
familleureux:50.5257,4.1997
farciennes:50.4273,4.553
faulx les tombes:50.4273,5.0191
fauroeulx:50.3703,4.1096
fauvillers:49.8509,5.665
faymonville:50.4054,6.1407
fays les veneurs:49.8662,5.1607
fayt le franc:50.3567,3.7725
fayt lez manage:50.4898,4.2283
felenne:50.0681,4.849
feluy:50.5626,4.2431
feneur:50.7042,5.7139
fernelmont:50.5481,4.9747
ferrieres:50.4,5.6051
feschaux:50.1509,4.9106
fexhe le haut clocher:50.6661,5.3985
fexhe slins:50.7219,5.5715
filot:50.4268,5.5681
finnevaux:50.1582,4.9453
fize fontaine:50.585,5.2835
fize le marsal:50.7014,5.3863
flamierge:50.0334,5.6039
flavion:50.2496,4.7134
flawinne:50.4566,4.8121
flemalle:50.6023,5.4581
flemalle grande:50.6156,5.4729
flemalle haute:50.6018,5.4475
flenu:50.4368,3.8878
fleron:50.6168,5.6832
fleurus:50.4719,4.5447
flobecq:50.7372,3.7379
flone:50.5582,5.3355
floree:50.3731,5.0704
floreffe:50.4348,4.7589
florennes:50.2514,4.603
florenville:49.6993,5.3101
floriffoux:50.4516,4.7694
flostoy:50.3884,5.1845
focant:50.1315,5.0409
folx les caves:50.6611,4.9371
fontaine l eveque:50.4112,4.324
fontaine valmont:50.3208,4.2137
fontenelle:50.249,4.3827
fontenoille:49.7151,5.2345
fontenoy:50.5679,3.4734
fooz:50.6762,5.4376
forchies la marche:50.4384,4.3198
forest:50.8091,4.3178
foret:50.584,5.7002
forge philippe:49.9654,4.2521
forges:50.0226,4.3211
forrieres:50.1325,5.2842
forville:50.5746,5.0007
fosse:50.3388,5.8378
fosses la ville:50.396,4.6979
fouleng:50.6183,3.9283
fourbechies:50.1667,4.3167
fouron le comte:50.7611,5.7719
fouron saint martin:50.7409,5.8429
fouron saint pierre:50.7283,5.8242
fourons:50.7466,5.8391
foy notre dame:50.2472,4.9897
fraipont:50.5663,5.7228
fraire:50.2614,4.5082
fraiture:50.4787,5.4197
frameries:50.4088,3.8906
framont:49.9186,5.1602
franc waret:50.5211,4.976
franchimont:50.19,4.6394
francorchamps:50.4532,5.9528
franiere:50.4389,4.7318
frasnes:50.0796,4.5105
frasnes lez anvaing:50.6846,3.5455
frasnes lez buissenal:50.6678,3.6194
frasnes lez gosselies:50.5376,4.4502
freloux:50.6803,5.4067
freux:49.9708,5.4497
froidchapelle:50.1512,4.3269
froidfontaine:50.0604,5.0006
froidmont:50.5779,3.3288
fronville:50.2943,5.4221
froyennes:50.6195,3.357
fumal:50.5869,5.1846
furfooz:50.2233,4.9585
furnaux:50.308,4.7055
gaasbeek:50.7999,4.1888
gages:50.6068,3.8911
gallaix:50.6061,3.5748
galmaarden:50.7527,3.971
ganshoren:50.8712,4.3175
gaurain ramecroix:50.5925,3.4834
gavere:50.9292,3.6614
gedinne:49.9793,4.9389
geel:51.1611,4.9903
geer:50.6685,5.1711
geetbets:50.8952,5.1016
gelbressee:50.5114,4.9578
gelinden:50.7602,5.2509
gellik:50.8839,5.6091
gelrode:50.9671,4.8043
geluveld:50.8341,2.9963
geluwe:50.8269,3.0689
gembes:49.9972,5.0632
gembloux:50.5622,4.6987
gemmenich:50.7464,5.9968
genappe:50.608,4.4479
genk:50.9655,5.5001
genly:50.3923,3.9169
genoelselderen:50.8018,5.5369
gent:51.0397,3.7142
gentbrugge:51.0447,3.7589
gentinnes:50.5794,4.5927
genval:50.7207,4.4971
geraardsbergen:50.7689,3.8798
gerdingen:51.1304,5.5649
gerin:50.2453,4.8158
gerompont:50.6468,4.8807
gerouville:49.6184,5.4288
gerpinnes:50.3378,4.5277
gestel:51.1276,4.6646
gesves:50.4029,5.0776
ghislenghien:50.6567,3.8758
ghlin:50.4761,3.9037
ghoy:50.7283,3.8094
gibecq:50.6377,3.8878
gierle:51.2676,4.8677
gijverinkhove:50.9762,2.6728
gijzegem:50.9832,4.0414
gijzelbrechtegem:50.8279,3.5061
gijzenzele:50.9711,3.8164
gilly:50.427,4.4856
gimnee:50.1316,4.7141
gingelom:50.7514,5.1326
gistel:51.1583,2.9671
gits:50.9976,3.1103
givry:50.3795,4.0293
glabais:50.6369,4.4465
glabbeek:50.8725,4.9513
glain:50.6482,5.5419
glimes:50.68,4.8384
glons:50.7519,5.5398
gochenee:50.1842,4.7597
godarville:50.4956,4.2866
godinne:50.3505,4.876
godveerdegem:50.8594,3.8204
goe:50.6086,5.9562
goeferdinge:50.7654,3.8393
goegnies chaussee:50.3423,3.9442
goesnes:50.4401,5.2218
goetsenhoven:50.7714,4.9603
gomze andoumont:50.5451,5.6836
gondregnies:50.6271,3.9119
gonrieux:50.0374,4.4236
gontrode:50.9843,3.7976
gooik:50.798,4.103
gors opleeuw:50.8309,5.3849
gorsem:50.838,5.1659
gosselies:50.4654,4.4302
gotem:50.8011,5.3055
gottem:50.9647,3.464
gottignies:50.4972,4.0622
gougnies:50.3544,4.5772
gourdinne:50.29,4.4566
goutroux:50.4168,4.3612
gouvy:50.1908,5.9549
gouy lez pieton:50.4876,4.3287
gozee:50.3332,4.3516
grace berleur:50.6323,5.5012
grace hollogne:50.645,5.5032
graide:49.9514,5.0675
grammene:50.9764,3.4683
grand axhe:50.679,5.2244
grand hallet:50.6941,5.0341
grand halleux:50.3263,5.9073
grand leez:50.5782,4.761
grand manil:50.5569,4.683
grand rechain:50.6073,5.8108
grand reng:50.3288,4.0706
grand rosiere hottomont:50.6316,4.8675
grandglise:50.5044,3.6967
grandhan:50.33,5.4087
grandmenil:50.2923,5.6625
grandmetz:50.6221,3.6323
grandrieu:50.2005,4.1715
grandville:50.722,5.3379
grandvoir:49.8576,5.3718
grapfontaine:49.8215,5.4076
graty:50.6312,3.9967
graux:50.3256,4.7203
grazen:50.8754,5.1299
grembergen:51.0533,4.1025
grez doiceau:50.7386,4.6962
grimbergen:50.9503,4.4014
grimminge:50.7945,3.9525
grivegnee:50.6218,5.5996
grobbendonk:51.1887,4.7319
groot bijgaarden:50.8714,4.2636
groot gelmen:50.7832,5.2621
groot loon:50.7939,5.366
gros fays:49.8695,4.9831
grosage:50.5444,3.7571
grote brogel:51.142,5.5087
grote spouwen:50.8325,5.5538
grotenberge:50.8723,3.8334
gruitrode:51.0848,5.5814
grune:50.155,5.3829
grupont:50.0923,5.2798
guignies:50.5471,3.3663
guigoven:50.8426,5.4006
guirsch:49.7194,5.8534
gullegem:50.8449,3.2026
haacht:50.9769,4.6387
haaltert:50.9023,4.0058
haasdonk:51.1806,4.2384
haasrode:50.8179,4.7284
habay:49.7356,5.5933
habay la neuve:49.7286,5.6504
habay la vieille:49.7228,5.6225
habergy:49.6153,5.7608
haccourt:50.734,5.6668
hachy:49.7016,5.6805
hacquegnies:50.6522,3.5939
haillot:50.4406,5.1492
haine saint paul:50.4549,4.1883
haine saint pierre:50.4548,4.2
hainin:50.4312,3.7661
hakendover:50.7972,4.9887
halanzy:49.559,5.7422
halen:50.9384,5.1074
hallaar:51.0876,4.7191
halle:50.7361,4.2374
halle booienhoven:50.8127,5.1206
halleux:50.1717,5.502
halma:50.0754,5.1374
halmaal:50.8006,5.1499
haltinne:50.4509,5.0744
ham:51.1142,5.1781
ham sur heure:50.322,4.3889
ham sur sambre:50.4445,4.6735
hamipre:49.836,5.4564
hamme:51.0882,4.1203
hamme mille:50.7819,4.7206
hamoir:50.4254,5.5328
hamois:50.3409,5.1594
hamont:51.2546,5.5313
hamont achel:51.2548,5.5129
hampteau:50.2579,5.4729
han sur lesse:50.1255,5.1877
handzame:51.0322,2.9961
haneffe:50.6387,5.3192
hanneche:50.5796,5.0495
hannut:50.6725,5.078
hanret:50.5835,4.9441
hansbeke:51.0748,3.5346
hantes wiheries:50.3058,4.1784
hanzinelle:50.295,4.5607
hanzinne:50.3085,4.5436
harchies:50.4794,3.6936
harelbeke:50.8293,3.3426
haren:50.892,4.4126
hargimont:50.1826,5.3095
harmignies:50.4076,4.0178
harnoncourt:49.5343,5.4997
harre:50.3517,5.6588
harsin:50.1738,5.3476
harveng:50.3949,3.9869
harze:50.4409,5.6673
hasselt:50.9304,5.3368
hastiere:50.1974,4.8226
hastiere lavaux:50.2165,4.8242
hastiere par dela:50.2151,4.8295
hatrival:50.0053,5.3481
haulchin:50.3832,4.0801
hauset:50.708,6.0708
haut fays:50.0017,5.0169
haut ittre:50.6488,4.2965
haut le wastia:50.3053,4.8417
hautrage:50.4824,3.765
havay:50.3612,3.9842
havelange:50.3871,5.2396
haversin:50.2531,5.2089
havinnes:50.6157,3.4656
havre:50.4643,4.0453
hechtel:51.1166,5.3416
hechtel eksel:51.1166,5.3416
heer:50.1617,4.8317
heers:50.751,5.3018
hees:50.8461,5.6125
heestert:50.7822,3.412
heffen:51.0519,4.4125
heikruis:50.7348,4.1127
heindonk:51.067,4.4067
heinsch:49.7008,5.7465
heist op den berg:51.0625,4.7194
hekelgem:50.9138,4.1118
heks:50.7688,5.3568
helchin:50.73,3.3837
helchteren:51.0743,5.3845
heldergem:50.8817,3.9548
helecine:50.7514,4.9822
helen bos:50.836,5.0802
hellebecq:50.6632,3.8888
hemelveerdegem:50.8088,3.8639
hemiksem:51.1442,4.3421
hemptinne:50.601,4.987
hemptinne lez florennes:50.2283,4.5631
hendrieken:50.7972,5.3288
henis:50.7994,5.4697
hennuyeres:50.6387,4.1716
henri chapelle:50.6768,5.9318
henripont:50.5996,4.1861
hensies:50.4328,3.6847
heppen:51.1158,5.2265
heppenbach:50.3632,6.2187
heppignies:50.4817,4.4935
herbeumont:49.7815,5.2378
herchies:50.5282,3.8577
herderen:50.8071,5.5745
herdersem:50.9735,4.0687
herent:50.9079,4.6727
herentals:51.1856,4.8346
herenthout:51.1392,4.7544
herfelingen:50.7477,4.0975
hergenrath:50.7091,6.0317
herinnes lez pecq:50.7009,3.3624
herk de stad:50.9223,5.1884
hermalle sous argenteau:50.7105,5.6809
hermalle sous huy:50.557,5.3623
hermee:50.7088,5.6186
hermeton sur meuse:50.1967,4.8189
herne:50.7233,4.026
heron:50.5508,5.0972
herquegies:50.6349,3.5786
herseaux:50.7227,3.2342
herselt:51.0554,4.9018
herstal:50.6702,5.6404
herstappe:50.7274,5.4261
hertain:50.6141,3.288
herten:50.827,5.3322
hertsberge:51.11,3.2612
herve:50.6392,5.7935
herzele:50.8883,3.8874
heule:50.8512,3.2382
heure:50.2945,5.2963
heure le romain:50.7317,5.6296
heurne:50.8879,3.6406
heusden:51.0415,5.2836
heusden zolder:51.0233,5.275
heusy:50.578,5.8675
heuvelland:50.7676,2.8457
hever:50.9926,4.5553
heverlee:50.8517,4.6931
hevillers:50.6221,4.6168
heyd:50.3464,5.5622
hillegem:50.8958,3.8536
hingene:51.1031,4.2931
hingeon:50.5245,5.0088
hives:50.1507,5.5783
hoboken:51.1758,4.3512
hodeige:50.696,5.3427
hodister:50.2007,5.4954
hody:50.4869,5.501
hoegaarden:50.7878,4.8811
hoeilaart:50.7675,4.4744
hoeke:51.2937,3.3303
hoelbeek:50.8833,5.5561
hoeleden:50.8668,5.0015
hoepertingen:50.8116,5.2853
hoeselt:50.8501,5.4865
hoevenen:51.3066,4.4047
hofstade:50.9939,4.5043
hogne:50.2486,5.2795
hognoul:50.6808,5.4556
hollain:50.5422,3.4272
hollange:49.9065,5.6882
hollebeke:50.8056,2.9384
hollogne aux pierres:50.6386,5.4758
hollogne sur geer:50.6771,5.2046
holsbeek:50.9217,4.7557
hombeek:51.0117,4.4212
hombourg:50.7232,5.9208
hompre:49.9438,5.6867
hondelange:49.6352,5.835
honnay:50.0666,5.0123
honnelles:50.3521,3.731
hooglede:50.9822,3.0687
hoogstade:50.9801,2.6903
hoogstraten:51.3957,4.7441
horebeke:50.8349,3.692
horion hozemont:50.615,5.3887
hornu:50.4338,3.8276
horpmaal:50.7583,5.3328
horrues:50.6093,4.0413
hotton:50.2688,5.4463
houdemont:49.7189,5.5843
houdeng aimeries:50.4836,4.1524
houdeng goegnies:50.488,4.1575
houdremont:49.942,4.9446
houffalize:50.1324,5.7887
hour:50.1613,5.0372
housse:50.6796,5.694
houtain le val:50.5763,4.411
houtain saint simeon:50.7392,5.6104
houtaing:50.6397,3.68
houtave:51.2388,3.1072
houtem:51.0069,2.6043
houthalen:51.0366,5.4122
houthalen helchteren:51.0282,5.3713
houthem:50.7868,2.9641
houthulst:50.9741,2.9438
houtvenne:51.0461,4.8013
houwaart:50.9341,4.8606
houx:50.3032,4.8979
houyet:50.1901,5.0051
hove:51.1486,4.4774
hoves:50.6717,4.0358
howardries:50.517,3.3542
huccorgne:50.5676,5.1648
huise:50.8988,3.5908
huissignies:50.5658,3.7533
huizingen:50.7493,4.2733
huldenberg:50.7951,4.5829
hulshout:51.0754,4.7885
hulsonniaux:50.2016,4.9478
hulste:50.8821,3.299
humain:50.2053,5.2552
humbeek:50.9728,4.3778
hundelgem:50.8892,3.7553
huppaye:50.6928,4.8922
huy:50.5215,5.2357
hyon:50.4392,3.9619
ichtegem:51.0874,3.0296
iddergem:50.8747,4.0441
idegem:50.8043,3.9295
ieper:50.8518,2.8915
impe:50.9605,3.9522
incourt:50.6918,4.7989
ingelmunster:50.922,3.2617
ingooigem:50.8298,3.4272
irchonwelz:50.6202,3.7537
isieres:50.6638,3.8182
isnes:50.5105,4.7407
itegem:51.104,4.7319
itterbeek:50.8396,4.2501
ittre:50.6463,4.2612
ivoz ramet:50.5823,5.4523
ixelles:50.8223,4.3816
izegem:50.9138,3.2091
izel:49.694,5.3748
izenberge:50.9897,2.6608
izier:50.3849,5.5793
jabbeke:51.1846,3.0903
jalhay:50.5593,5.9648
jallet:50.4433,5.1822
jamagne:50.2181,4.5313
jambes:50.4589,4.8785
jamiolle:50.2122,4.5079
jamioulx:50.3529,4.4128
jamoigne:49.6958,5.4205
jandrain jandrenouille:50.674,4.9793
jauche:50.6816,4.9552
jauchelette:50.6866,4.8435
javingue:50.1019,4.9188
jehay:50.5755,5.3203
jehonville:49.9066,5.2022
jemappes:50.4484,3.8894
jemelle:50.1624,5.2625
jemeppe sur meuse:50.6168,5.505
jemeppe sur sambre:50.463,4.6546
jeneffe:50.6532,5.3559
jesseren:50.8059,5.3905
jette:50.8778,4.3261
jeuk:50.7326,5.2095
jodoigne:50.7218,4.871
jodoigne souveraine:50.7081,4.8406
jollain merlin:50.546,3.4041
joncret:50.3528,4.5126
julemont:50.6856,5.7719
jumet:50.4447,4.436
jupille sur meuse:50.6432,5.6301
juprelle:50.7107,5.5291
jurbise:50.5325,3.9113
juseret:49.8805,5.5493
kaaskerke:51.0358,2.8387
kachtem:50.9399,3.189
kaggevinne:50.9777,5.0299
kain:50.6379,3.3809
kalken:51.037,3.9186
kallo:51.2652,4.2588
kalmthout:51.3833,4.4763
kampenhout:50.9492,4.5712
kanegem:51.0214,3.4036
kanne:50.8142,5.6692
kapelle op den bos:51.0132,4.36
kapellen:51.3328,4.4312
kaprijke:51.229,3.6219
kaster:50.8122,3.4976
kasterlee:51.2408,4.9678
kaulille:51.1939,5.5173
keerbergen:51.0049,4.6266
keiem:51.0862,2.8815
kemexhe:50.6962,5.406
kemmel:50.7952,2.8384
kemzeke:51.2065,4.0771
kerkhove:50.8008,3.5059
kerkom:50.857,4.8643
kerkom bij sint truiden:50.7733,5.1788
kerksken:50.8846,3.9792
kermt:50.9524,5.251
kerniel:50.8237,5.3616
kersbeek miskom:50.8931,5.0065
kessel:51.1445,4.6393
kessel lo:50.8899,4.7308
kessenich:51.1492,5.8089
kester:50.7631,4.1213
kettenis:50.6461,6.0458
keumiee:50.4655,4.596
kieldrecht:51.3039,4.1983
kinrooi:51.1431,5.7415
klein gelmen:50.7714,5.2764
kleine brogel:51.1726,5.4624
kleine spouwen:50.838,5.5474
klemskerke:51.2425,3.0239
klerken:50.9904,2.9155
kluisbergen:50.7783,3.5212
kluizen:51.1547,3.7326
knesselare:51.1393,3.4123
knokke:51.3494,3.3234
knokke heist:51.3396,3.2702
kobbegem:50.9092,4.2497
koekelare:51.0912,2.9682
koekelberg:50.8623,4.3257
koersel:51.0698,5.2712
koksijde:51.1091,2.6353
kolmont:50.8027,5.4207
koningshooikt:51.0929,4.6034
koninksem:50.7678,5.4417
kontich:51.1344,4.4456
kooigem:50.7397,3.3261
koolkerke:51.242,3.2474
koolskamp:51.0075,3.2016
korbeek dijle:50.847,4.6299
korbeek lo:50.8618,4.7562
kortemark:51.0285,3.0441
kortenaken:50.9057,5.0684
kortenberg:50.8833,4.5365
kortessem:50.862,5.377
kortijs:50.7053,5.1486
kortrijk:50.8179,3.2784
kortrijk dutsel:50.9185,4.7855
kozen:50.8753,5.2414
kraainem:50.8606,4.4691
krombeke:50.9046,2.6729
kruibeke:51.1712,4.3091
kruishoutem:50.9201,3.5404
kumtich:50.8246,4.8864
kuringen:50.9439,5.3052
kuttekoven:50.8141,5.331
kuurne:50.8601,3.2736
kwaadmechelen:51.0966,5.1326
kwaremont:50.7751,3.5231
l ecluse:50.7717,4.832
l escaillere:49.9472,4.4317
la bouverie:50.408,3.8774
la bruyere:50.4134,5.7267
la calamine:50.7155,6.0133
la glanerie:50.5298,3.301
la gleize:50.4129,5.8459
la hestre:50.4739,4.2358
la hulpe:50.7315,4.4797
la louviere:50.4795,4.1853
la reid:50.4895,5.7906
la roche en ardenne:50.1829,5.5702
laakdal:51.0803,5.0073
laar:51.2688,4.441
laarne:51.0297,3.8505
labuissiere:50.3142,4.1948
lacuisine:49.717,5.3183
ladeuze:50.568,3.7713
laeken:50.8834,4.3487
laforet:49.8639,4.9295
lahamaide:50.6956,3.7247
lamain:50.5983,3.2931
lambermont:49.7052,5.191
lambusart:50.4547,4.5579
lamine:50.6891,5.334
lamontzee:50.5837,5.0899
lamorteau:49.5262,5.4795
lampernisse:51.0396,2.7703
lanaken:50.8893,5.6513
lanaye:50.7807,5.6944
landegem:51.0546,3.5888
landelies:50.3778,4.3496
landen:50.7493,5.0791
landenne:50.5142,5.0646
landskouter:50.9695,3.7928
laneffe:50.2778,4.495
langdorp:51.0119,4.8857
langemark:50.9101,2.9122
langemark poelkapelle:50.9123,2.9339
lanklaar:51.0109,5.6748
lanquesaint:50.6534,3.8043
lantin:50.688,5.5235
lantremange:50.7114,5.2947
laplaigne:50.523,3.4419
lapscheure:51.2821,3.3524
lasne:50.686,4.4844
lasne chapelle saint lambert:50.6927,4.5005
lathuy:50.723,4.8246
latinne:50.6242,5.1632
latour:49.5582,5.5705
lauw:50.7399,5.4148
lauwe:50.7888,3.1939
lavacherie:50.0523,5.5136
lavoir:50.5487,5.1257
le mesnil:50.0309,4.6713
le roeulx:50.5034,4.1122
le roux:50.3885,4.6238
lebbeke:51.0004,4.1308
lede:50.9661,3.9775
ledeberg:51.0372,3.7414
ledegem:50.869,3.1177
leefdaal:50.842,4.5905
leerbeek:50.7774,4.1193
leernes:50.3974,4.3308
leers et fosteau:50.3042,4.2448
leers nord:50.6876,3.2704
leest:51.0351,4.415
leeuwergem:50.8881,3.8293
leffinge:51.1747,2.8777
leglise:49.8004,5.5381
leignon:50.2687,5.1103
leisele:50.9845,2.6224
leke:51.1007,2.8993
lembeek:50.7093,4.2143
lembeke:51.1942,3.6346
lemberge:50.978,3.7726
lendelede:50.8851,3.232
lennik:50.8086,4.1649
lens:50.5571,3.9005
lens saint remy:50.6534,5.1329
lens saint servais:50.6637,5.1609
lens sur geer:50.7215,5.3538
leopoldsburg:51.1221,5.2639
les avins:50.4154,5.2994
les bons villers:50.535,4.4253
les bulles:49.7031,5.4263
les hayons:49.8133,5.1457
les waleffes:50.6402,5.218
lesdain:50.5203,3.3881
lessines:50.7123,3.8301
lessive:50.138,5.1458
lesterny:50.111,5.2799
lesve:50.3773,4.7748
letterhoutem:50.927,3.8813
leugnies:50.2246,4.1962
leupegem:50.8336,3.6086
leut:50.9922,5.7355
leuven:50.8813,4.693
leuze:50.5606,4.9103
leuze en hainaut:50.599,3.6177
leval chaudeville:50.2349,4.229
leval trahegnies:50.4165,4.2181
liberchies:50.5152,4.4244
libin:49.9809,5.2569
libramont chevigny:49.9197,5.3824
lichtaart:51.2309,4.9037
lichtervelde:51.0303,3.1423
liedekerke:50.8711,4.0861
lieferinge:50.7919,4.0533
liege:50.6451,5.5734
lier:51.1311,4.5697
lierde:50.815,3.825
lierneux:50.2857,5.7921
liernu:50.5821,4.8311
liers:50.6934,5.5638
liezele:51.0549,4.2809
ligne:50.6223,3.7055
ligney:50.6617,5.1824
ligny:50.5126,4.5758
lille:51.2382,4.8242
lillo:51.3046,4.29
lillois witterzee:50.6484,4.3671
limal:50.693,4.5739
limbourg:50.6123,5.9403
limelette:50.6852,4.5549
limerle:50.1609,5.9394
limont:50.66,5.3107
lincent:50.7116,5.0318
linden:50.8989,4.7757
linkebeek:50.7716,4.3346
linkhout:50.9658,5.1373
linsmeau:50.7323,5.003
lint:51.1268,4.4922
linter:50.8292,5.041
lippelo:51.0451,4.2519
lisogne:50.2814,4.9715
lissewege:51.3171,3.1992
lives sur meuse:50.4713,4.9384
lixhe:50.7551,5.6801
lo:50.9931,2.7608
lo reninge:50.9638,2.7643
lobbes:50.346,4.2655
lochristi:51.0992,3.8271
lodelinsart:50.4319,4.4489
loenhout:51.3994,4.6428
loker:50.7837,2.7797
lokeren:51.1042,3.9911
loksbergen:50.9321,5.0656
lombardsijde:51.154,2.755
lombise:50.6008,3.9398
lommel:51.2306,5.3077
lommersweiler:50.2389,6.1651
lompret:50.0642,4.379
lomprez:50.0762,5.0921
loncin:50.6652,5.5027
londerzeel:51.0122,4.2991
longchamps:50.5773,4.8962
longlier:49.8562,5.4609
longueville:50.7024,4.7392
longvilly:50.025,5.8368
lontzen:50.6804,6.0073
lonzee:50.5534,4.7274
loonbeek:50.807,4.6068
loppem:51.1557,3.1956
lorce:50.4145,5.7321
lot:50.7651,4.273
lotenhulle:51.0497,3.4597
louette saint denis:49.9589,4.9572
louette saint pierre:49.9601,4.9277
loupoigne:50.5929,4.432
louvain la neuve:50.6742,4.6142
louveigne:50.5248,5.7172
lovendegem:51.0957,3.6076
lovenjoel:50.8548,4.7867
loverval:50.375,4.4734
loyers:50.4581,4.941
lubbeek:50.8821,4.8401
luingne:50.7386,3.2345
lummen:51.0031,5.2026
lustin:50.3793,4.8966
luttre:50.5146,4.3889
maarke kerkem:50.8072,3.6489
maarkedal:50.7973,3.6428
maaseik:51.0947,5.7917
maasmechelen:50.9635,5.6964
mabompre:50.0989,5.7385
machelen:50.9124,4.4354
macon:50.0521,4.2096
macquenoise:49.9755,4.1803
maffe:50.3533,5.3126
maffle:50.6151,3.806
magnee:50.6029,5.6811
maillen:50.3776,4.9699
mainvault:50.6496,3.7184
maisieres:50.4902,3.9628
maissin:49.9651,5.1806
maizeret:50.4598,4.9782
mal:50.769,5.5224
maldegem:51.2263,3.4155
malderen:51.0198,4.2438
malempre:50.2816,5.7155
maleves sainte marie wastines:50.6565,4.7801
malle:51.3001,4.715
malmedy:50.424,6.0266
malonne:50.4383,4.7967
malvoisin:50.0121,4.961
manage:50.5036,4.2343
manderfeld:50.3311,6.3401
manhay:50.293,5.6756
mannekensvere:51.1258,2.8183
maransart:50.6561,4.456
marbais:50.5505,4.5381
marbaix:50.3268,4.3714
marche en famenne:50.2241,5.3429
marche les dames:50.4864,4.9615
marche lez ecaussinnes:50.5469,4.1833
marchienne au pont:50.4067,4.396
marchin:50.4802,5.2263
marchipont:50.3779,3.667
marchovelette:50.5232,4.9411
marcinelle:50.3977,4.4443
marcourt:50.2145,5.5268
marcq:50.6904,4.0173
marenne:50.2418,5.4166
mariakerke:51.0731,3.6781
mariekerke:51.0665,4.201
mariembourg:50.0941,4.5233
marilles:50.7073,4.9529
marke:50.807,3.2336
markegem:50.9501,3.3944
marneffe:50.5791,5.1449
marquain:50.6079,3.3226
martelange:49.8313,5.7376
martenslinde:50.8523,5.534
martouzin neuville:50.1176,5.0039
masbourg:50.1144,5.3137
masnuy saint jean:50.531,3.9424
masnuy saint pierre:50.537,3.9598
massemen:50.9809,3.8736
massenhoven:51.199,4.6357
matagne la grande:50.1171,4.6236
matagne la petite:50.1186,4.6469
mater:50.8429,3.6636
maubray:50.5515,3.502
maulde:50.617,3.5484
maurage:50.4577,4.098
mazee:50.1009,4.6965
mazenzele:50.9429,4.1718
mazy:50.5128,4.6745
mean:50.3619,5.3339
mechelen:51.028,4.4713
mechelen aan de maas:50.9764,5.6457
mechelen bovelingen:50.7428,5.2629
meeffe:50.609,5.0163
meensel kiezegem:50.8951,4.9173
meer:51.4609,4.7373
meerbeek:50.8783,4.5973
meerbeke:50.8197,4.0459
meerdonk:51.2589,4.1512
meerhout:51.1317,5.0772
meerle:51.4744,4.8052
meeswijk:51.0014,5.7468
meetkerke:51.2356,3.147
meeuwen:51.0782,5.5029
meeuwen gruitrode:51.0933,5.5541
mehaigne:50.5942,4.8762
meigem:51.0175,3.5414
meilegem:50.9052,3.6993
meise:50.9342,4.3287
meix devant virton:49.6056,5.4816
meix le tige:49.6152,5.7187
melden:50.8156,3.5655
meldert:50.7896,4.8295
melen:50.6461,5.737
melin:50.7401,4.8286
melkwezer:50.8249,5.0585
melle:51.003,3.7989
mellery:50.5818,4.5691
melles:50.6467,3.4819
mellet:50.5046,4.4782
mellier:49.7672,5.5209
melsbroek:50.9171,4.4759
melsele:51.2211,4.2821
melsen:50.9579,3.6929
membach:50.6194,5.9954
membre:49.8655,4.9003
membruggen:50.8178,5.5392
mendonk:51.1467,3.8221
menen:50.797,3.1157
merbes le chateau:50.3234,4.1645
merbes sainte marie:50.3552,4.1711
merchtem:50.9592,4.2328
merdorp:50.6493,4.9987
mere:50.923,3.971
merelbeke:50.9943,3.7459
merendree:51.0829,3.5715
merkem:50.9621,2.8736
merksem:51.2499,4.4453
merksplas:51.3581,4.8628
merlemont:50.1729,4.6073
meslin l eveque:50.6486,3.8481
mesnil eglise:50.1636,4.9616
mesnil saint blaise:50.1672,4.8855
mespelare:50.9956,4.0653
messancy:49.5969,5.8169
messelbroek:50.9895,4.9247
messines:50.7597,2.9001
mesvin:50.4284,3.9607
mettekoven:50.7803,5.2897
mettet:50.3212,4.6585
meulebeke:50.9485,3.286
meux:50.5526,4.7987
mevergnies lez lens:50.6045,3.8507
meyerode:50.3288,6.1885
michelbeke:50.8341,3.7638
micheroux:50.6316,5.7355
middelburg:51.2558,3.4071
middelkerke:51.1833,2.8063
miecret:50.3657,5.2494
mielen boven aalst:50.7573,5.2141
mignault:50.5292,4.1521
millen:50.7845,5.5603
milmort:50.6905,5.5929
minderhout:51.4316,4.8071
mirwart:50.057,5.2653
modave:50.4416,5.3018
moen:50.7754,3.3825
moerbeke:51.1743,3.9446
moerbeke waas:51.1743,3.9446
moere:51.132,2.9566
moerkerke:51.2422,3.3558
moerzeke:51.0618,4.1586
moha:50.5472,5.1879
mohiville:50.3177,5.1923
moignelee:50.4378,4.5886
moircy:49.9895,5.4681
mol:51.184,5.1155
molenbaix:50.693,3.4295
molenbeek saint jean:50.8544,4.3228
molenbeek wersbeek:50.9212,4.9541
molenbeersel:51.1684,5.7261
molenstede:51.0072,5.0247
mollem:50.9328,4.224
momalle:50.6852,5.373
momignies:50.0286,4.165
monceau en ardenne:49.9046,4.986
monceau imbrechies:50.0365,4.2241
monceau sur sambre:50.417,4.3824
mons:50.455,3.952
mons lez liege:50.6225,5.4601
monstreux:50.5932,4.286
mont:50.5342,5.791
mont de l enclus:50.7457,3.5111
mont gauthier:50.2093,5.1208
mont saint andre:50.655,4.8636
mont saint aubert:50.6554,3.4
mont saint guibert:50.6366,4.6127
mont sainte aldegonde:50.4294,4.2341
mont sainte genevieve:50.3766,4.2377
mont sur marchienne:50.3902,4.4046
montbliart:50.1344,4.2244
montegnee:50.6426,5.519
montenaken:50.7184,5.1386
montignies lez lens:50.5643,3.9434
montignies saint christophe:50.2816,4.1885
montignies sur roc:50.368,3.7333
montignies sur sambre:50.4109,4.4729
montigny le tilleul:50.3691,4.3602
montleban:50.1876,5.8289
montroeul au bois:50.6429,3.5714
montroeul sur haine:50.436,3.7037
montzen:50.7075,5.962
moorsel:50.9524,4.1009
moorsele:50.8426,3.1549
moorslede:50.8901,3.0732
moortsele:50.9591,3.78
mopertingen:50.8623,5.5761
moregem:50.8504,3.5624
moresnet:50.7209,5.988
morhet:49.9576,5.5824
morialme:50.2776,4.5634
morkhoven:51.1203,4.8208
morlanwelz:50.451,4.2524
morlanwelz mariemont:50.4545,4.2439
mormont:50.1458,5.7189
mornimont:50.4555,4.7043
mortier:50.6822,5.7433
mortroux:50.7132,5.7514
mortsel:51.1742,4.4593
morville:50.233,4.744
mouland:50.7552,5.7148
moulbaix:50.6002,3.7157
mourcourt:50.653,3.4452
mouscron:50.7433,3.2139
moustier:50.6557,3.6199
moustier sur sambre:50.4661,4.6967
mouzaive:49.8535,4.962
moxhe:50.63,5.0814
mozet:50.4416,4.9847
muizen:51.0083,4.5183
mullem:50.8964,3.604
munkzwalm:50.8777,3.7327
muno:49.7177,5.176
munsterbilzen:50.8883,5.527
munte:50.9452,3.7445
musson:49.5581,5.7059
mussy la ville:49.5714,5.6617
my:50.4053,5.5726
naast:50.5537,4.1012
nadrin:50.1612,5.6807
nafraiture:49.9107,4.9172
nalinnes:50.3249,4.4467
nameche:50.4712,4.9947
namur:50.4562,4.8493
nandrin:50.5064,5.419
naninne:50.4146,4.9317
naome:49.9226,5.0894
nassogne:50.1294,5.3455
natoye:50.3414,5.0562
nazareth:50.9598,3.5963
nechin:50.6669,3.269
neder over heembeek:50.8978,4.3905
nederboelare:50.7811,3.8718
nederbrakel:50.8052,3.7618
nederename:50.8678,3.6323
nederhasselt:50.8464,3.975
nederokkerzeel:50.919,4.5645
nederzwalm hermelgem:50.8868,3.688
neerglabbeek:51.0968,5.6182
neerharen:50.9078,5.681
neerhespen:50.788,5.0579
neerheylissem:50.7568,4.989
neerijse:50.8112,4.629
neerlanden:50.7821,5.0794
neerlinter:50.8434,5.0284
neeroeteren:51.0946,5.7027
neerpelt:51.229,5.4314
neerrepen:50.8121,5.4449
neervelp:50.8167,4.8137
neerwinden:50.7652,5.041
neigem:50.803,4.0607
nerem:50.7631,5.5102
nessonvaux:50.5737,5.7371
nethen:50.7838,4.6737
nettinne:50.291,5.2613
neu moresnet:50.72,6.0241
neufchateau:50.7196,5.7764
neufmaison:50.5305,3.7919
neufvilles:50.5683,4.0029
neupre:50.5432,5.4901
neuville:50.3868,5.7242
neuville en condroz:50.552,5.4514
nevele:51.033,3.5491
niel:51.1099,4.3303
niel bij as:51.0182,5.6162
niel bij sint truiden:50.7405,5.1419
nieuwenhove:50.7875,3.9892
nieuwenrode:50.98,4.3512
nieuwerkerken:50.8746,5.191
nieuwkapelle:50.9974,2.8043
nieuwkerke:50.7457,2.8252
nieuwkerken waas:51.1934,4.178
nieuwmunster:51.2758,3.0994
nieuwpoort:51.1442,2.7284
nieuwrode:50.947,4.8338
nijlen:51.1612,4.671
nil saint vincent saint martin:50.6407,4.6743
nimy:50.4759,3.9546
ninove:50.8354,4.0242
nismes:50.0745,4.5486
nivelles:50.5892,4.3319
niverlee:50.1178,4.7027
nives:49.9121,5.6027
nobressart:49.7399,5.7187
nodebais:50.7725,4.7339
noduwez:50.7293,4.964
noirchain:50.4019,3.9299
noirfontaine:50.6176,5.4123
noiseux:50.2977,5.3737
nokere:50.8854,3.5108
nollevaux:49.8711,5.1221
noorderwijk:51.1416,4.8401
noordschote:50.9485,2.8217
nossegem:50.885,4.5081
nothomb:49.7718,5.7861
nouvelles:50.4101,3.9689
noville:50.6599,5.3827
noville les bois:50.5556,4.9827
noville sur mehaigne:50.6082,4.8909
nukerke:50.7966,3.5955
obaix:50.5344,4.3401
obigies:50.6621,3.3643
obourg:50.476,4.0062
ochamps:49.9245,5.2782
ocquier:50.3965,5.3955
odeigne:50.2564,5.6826
odeur:50.7077,5.4158
oedelem:51.166,3.3441
oekene:50.9043,3.1628
oelegem:51.2111,4.5972
oeren:51.0235,2.7052
oeselgem:50.9401,3.4297
oetingen:50.7721,4.0615
oeudeghien:50.6781,3.7118
oevel:51.1378,4.9053
offagne:49.8856,5.175
ogy:50.7208,3.7802
ohain:50.6951,4.4506
ohey:50.4359,5.1238
oignies en thierache:50.0237,4.6397
oisquercq:50.6701,4.2168
oizy:49.8935,5.0089
okegem:50.8564,4.0561
olen:51.1439,4.8597
oleye:50.7125,5.2809
ollignies:50.6874,3.8599
olloy sur viroin:50.0727,4.6072
olmen:51.1337,5.1648
olne:50.5901,5.748
olsene:50.9358,3.4652
omal:50.6555,5.1969
ombret:50.5443,5.3372
omezee:50.1933,4.6996
on:50.1716,5.2863
onhaye:50.2436,4.8409
onkerzele:50.7788,3.904
onnezies:50.3635,3.7163
onoz:50.4923,4.6697
onze lieve vrouw lombeek:50.822,4.112
onze lieve vrouw waver:51.0625,4.58
ooigem:50.895,3.3305
ooike:50.8712,3.5514
oombergen:50.8988,3.8381
oorbeek:50.7922,4.9138
oordegem:50.9574,3.9021
oostakker:51.1002,3.7644
oostduinkerke:51.1253,2.7013
oosteeklo:51.193,3.6878
oostende:51.2303,2.9203
oosterzele:50.9456,3.8033
oostham:51.1088,5.1839
oostkamp:51.1511,3.2497
oostkerke:51.2752,3.2885
oostmalle:51.3019,4.7332
oostnieuwkerke:50.9416,3.0642
oostrozebeke:50.9343,3.3468
oostvleteren:50.9231,2.7492
oostwinkel:51.1509,3.5253
opbrakel:50.7922,3.7463
opdorp:51.0286,4.2214
opglabbeek:51.043,5.582
opgrimbie:50.9436,5.681
ophain bois seigneur isaac:50.6563,4.3508
ophasselt:50.8219,3.897
opheers:50.7367,5.2944
opheylissem:50.7478,4.9781
ophoven:51.1323,5.7882
opitter:51.1184,5.6478
oplinter:50.8285,4.9951
opoeteren:51.0534,5.6487
opont:49.9349,5.1201
opprebais:50.6818,4.7958
oppuurs:51.0622,4.239
opvelp:50.8073,4.7913
opwijk:50.9691,4.1897
orbais:50.6376,4.7631
orchimont:49.8937,4.9275
orcq:50.605,3.3493
ordingen:50.8138,5.2382
oret:50.3004,4.6158
oreye:50.7292,5.3531
orgeo:49.8343,5.3023
ormeignies:50.5947,3.7516
orp jauche:50.7001,4.989
orp le grand:50.7035,4.9913
orroir:50.7476,3.4817
orsmaal gussenhoven:50.8054,5.0675
ortho:50.1249,5.6138
ostiches:50.6789,3.7584
otegem:50.8093,3.4245
oteppe:50.5824,5.127
othee:50.7159,5.4681
otrange:50.7371,5.3845
ottenburg:50.7541,4.6258
ottergem:50.9341,3.9469
ottignies:50.6664,4.5691
ottignies louvain la neuve:50.6727,4.5805
oud heverlee:50.8218,4.6679
oud turnhout:51.3178,4.9817
oudegem:51.0082,4.0514
oudekapelle:51.0207,2.8041
oudenaarde:50.8443,3.6048
oudenaken:50.7805,4.1959
oudenburg:51.2012,3.0061
ouffet:50.4377,5.4653
ougree:50.5993,5.539
oupeye:50.7092,5.6451
outer:50.8466,3.9977
outgaarden:50.7666,4.9194
outrelouxhe:50.5042,5.3353
outrijve:50.7587,3.4257
ouwegem:50.9121,3.5978
overboelare:50.7623,3.8625
overhespen:50.7968,5.03
overijse:50.7729,4.5385
overmere:51.0507,3.9569
overpelt:51.2113,5.423
overrepen:50.8067,5.4301
overwinden:50.7524,5.0448
paal:51.0475,5.1617
paifve:50.728,5.5242
pailhe:50.423,5.2579
paliseul:49.9035,5.1349
pamel:50.8347,4.0821
papignies:50.6862,3.8191
parike:50.7849,3.7993
passendale:50.8992,3.0054
patignies:50,4.9521
paturages:50.4137,3.8629
paulatem:50.8964,3.7149
pecq:50.6856,3.3407
peer:51.1087,5.4492
peissant:50.3512,4.1209
pellaines:50.7228,5.0056
pellenberg:50.8721,4.7894
pepingen:50.7512,4.1786
pepinster:50.5675,5.8037
perk:50.9332,4.4961
peronnes lez antoing:50.5519,3.4538
peronnes lez binche:50.4364,4.1458
peruwelz:50.5098,3.5909
pervijze:51.0805,2.7915
perwez:50.6234,4.8135
pesche:50.0431,4.4585
pessoux:50.2825,5.1708
petegem aan de leie:50.9691,3.5325
petegem aan de schelde:50.8331,3.5581
petigny:50.0584,4.5324
petit enghien:50.6899,4.0846
petit fays:49.9016,4.9675
petit hallet:50.6876,5.0184
petit rechain:50.6143,5.8342
petit roeulx lez braine:50.6241,4.0895
petit roeulx lez nivelles:50.5588,4.3187
petit thier:50.3074,5.9673
petite chapelle:49.9498,4.5055
peutie:50.9272,4.4552
philippeville:50.1956,4.5449
pieton:50.4415,4.2984
pietrain:50.7255,4.9175
pietrebais:50.7311,4.7434
pipaix:50.5829,3.5759
piringen:50.7874,5.4198
pironchamps:50.4286,4.5261
pittem:51,3.2623
plainevaux:50.5447,5.5215
plancenoit:50.6625,4.4212
ploegsteert:50.7262,2.8803
plombieres:50.7375,5.9591
poederlee:51.2267,4.836
poeke:51.0415,3.4456
poelkapelle:50.9278,2.9633
poesele:51.0324,3.5117
pollare:50.8169,3.9969
polleur:50.5429,5.8739
pollinkhove:50.9727,2.7199
pommeroeul:50.4611,3.7107
pondrome:50.0996,5.0088
pont a celles:50.5043,4.3623
pont de loup:50.4174,4.546
pontillas:50.5501,5.0171
poperinge:50.8436,2.7223
poppel:51.4506,5.0488
popuelles:50.6622,3.5193
porcheresse:50.3384,5.2409
pottes:50.7314,3.405
poucet:50.6778,5.1124
poulseur:50.5098,5.5828
poupehan:49.8116,5.0036
pousset:50.6956,5.3034
presgaux:50.0248,4.4206
presles:50.385,4.5787
profondeville:50.3776,4.8694
proven:50.8903,2.6543
pry:50.2738,4.4327
pulderbos:51.2257,4.7034
pulle:51.2012,4.6975
purnode:50.3143,4.9455
pussemange:49.8111,4.8698
putte:51.0571,4.631
puurs:51.072,4.2862
quaregnon:50.4422,3.8637
quartes:50.6501,3.512
quenast:50.6719,4.1627
queue du bois:50.6372,5.6786
quevaucamps:50.5303,3.691
quevy:50.3667,3.9439
quevy le grand:50.361,3.9492
quevy le petit:50.368,3.9375
quievrain:50.4085,3.6819
rachecourt:49.5903,5.7248
racour:50.7388,5.029
raeren:50.6761,6.1108
ragnies:50.3082,4.2838
rahier:50.386,5.7786
ramegnies:50.5444,3.6351
ramegnies chin:50.6513,3.3353
ramelot:50.4644,5.3286
ramillies:50.6367,4.9149
ramsdonk:51.0115,4.3375
ramsel:51.0325,4.8336
ramskapelle:51.3127,3.2505
rance:50.143,4.2732
ransart:50.4562,4.4816
ransberg:50.8758,5.0361
ranst:51.1962,4.5638
ravels:51.3809,5.0198
rebaix:50.6602,3.7837
rebecq:50.6646,4.1355
rebecq rognon:50.6736,4.135
recht:50.3349,6.0431
recogne:49.9113,5.3608
redu:50.0078,5.1602
reet:51.1045,4.4059
rekem:50.9284,5.6626
rekkem:50.7744,3.1659
relegem:50.902,4.279
remagne:49.9764,5.4946
remersdaal:50.7284,5.8819
remicourt:50.6807,5.3267
renaix:50.7476,3.602
rendeux:50.233,5.5043
reninge:50.9423,2.7771
reningelst:50.817,2.7636
renlies:50.1899,4.267
reppel:51.147,5.5523
ressaix:50.4238,4.191
ressegem:50.8921,3.911
resteigne:50.0829,5.1778
retie:51.2676,5.0844
retinne:50.6303,5.6978
reuland:50.1954,6.1363
reves:50.5437,4.4055
rhisnes:50.5006,4.791
rhode saint genese:50.745,4.3464
richelle:50.7171,5.6954
riemst:50.8116,5.5979
rienne:49.9923,4.8848
riezes:49.9608,4.3683
rijkel:50.8043,5.2613
rijkevorsel:51.3495,4.7607
rijkhoven:50.8343,5.5163
rijmenam:51.0011,4.5842
riksingen:50.8065,5.4617
rillaar:50.9759,4.897
riviere:50.3581,4.8724
rixensart:50.7134,4.5273
robechies:50.0728,4.2784
robelmont:49.5953,5.5071
robertville:50.455,6.1225
roborst:50.8636,3.7536
rochefort:50.1726,5.214
rochehaut:49.8405,5.007
rocherath:50.4344,6.3009
roclenge sur geer:50.7569,5.5941
rocourt:50.678,5.5476
roesbrugge haringe:50.9151,2.6263
roeselare:50.9445,3.1248
rognee:50.2692,4.3892
roisin:50.3331,3.6938
roksem:51.1662,3.0333
rollegem:50.7723,3.2565
rollegem kapelle:50.8701,3.151
roloux:50.6495,5.396
roly:50.1357,4.5382
romedenne:50.1724,4.698
romeree:50.1352,4.6749
romershoven:50.8581,5.4593
romsee:50.6068,5.6655
rongy:50.5067,3.3816
ronquieres:50.6084,4.2235
ronsele:51.1304,3.5532
roosbeek:50.8402,4.862
roosdaal:50.8341,4.0972
rosee:50.2323,4.6877
roselies:50.4289,4.5729
rosieres:50.7371,4.5463
rosmeer:50.8458,5.5754
rossignol:49.7188,5.4852
rotem:51.0531,5.7205
rotheux rimiere:50.5353,5.4812
rotselaar:50.9544,4.7143
roucourt:50.5292,3.5871
rouveroy:50.3556,4.0628
rouvreux:50.4893,5.6643
rouvroy:49.5391,5.4897
roux:50.4415,4.3908
roux miroir:50.7085,4.7848
roy:50.1879,5.4096
rozebeke:50.8489,3.7533
ruddervoorde:51.0846,3.2015
ruette:49.5377,5.5938
ruien:50.774,3.486
ruisbroek:50.7849,4.2986
ruiselede:51.0628,3.3789
rukkelingen loon:50.7278,5.2539
rulles:49.7181,5.5581
rumbeke:50.9151,3.1223
rumes:50.5558,3.3039
rumillies:50.6201,3.4373
rummen:50.8859,5.1565
rumsdorp:50.7692,5.0696
rumst:51.0793,4.424
runkelen:50.8478,5.152
rupelmonde:51.1284,4.2906
russeignies:50.7448,3.531
rutten:50.7471,5.4421
s gravenwezel:51.2625,4.5556
s herenelderen:50.8065,5.503
saint amand:50.5112,4.5319
saint andre:50.6953,5.7536
saint aubin:50.2469,4.5778
saint denis:50.492,4.0182
saint georges sur meuse:50.6001,5.3579
saint gerard:50.3463,4.7395
saint germain:50.5731,4.8427
saint gery:50.5766,4.6203
saint ghislain:50.4484,3.8215
saint gilles:50.8267,4.3457
saint hubert:50.0251,5.3739
saint jean geest:50.7397,4.8958
saint josse ten noode:50.8531,4.3723
saint leger:49.6134,5.657
saint marc:50.4949,4.847
saint mard:49.5578,5.5285
saint martin:50.5008,4.6473
saint maur:50.5722,3.3924
saint medard:49.8159,5.3277
saint nicolas:50.6305,5.5394
saint pierre:49.9048,5.3864
saint remy:50.6958,5.7008
saint remy geest:50.7471,4.8584
saint sauveur:50.7062,3.5977
saint servais:50.4814,4.8351
saint severin:50.529,5.4131
saint symphorien:50.4366,4.0126
saint vaast:50.4525,4.1604
saint vincent:49.6774,5.4756
saint vith:50.2804,6.1259
sainte cecile:49.7294,5.243
sainte marie chevigny:49.9236,5.4578
sainte marie sur semois:49.6732,5.5645
sainte ode:50.0363,5.5245
saintes:50.7074,4.1601
saive:50.6525,5.682
salles:50.056,4.2474
samart:50.1779,4.534
sambreville:50.441,4.6197
samree:50.2093,5.6395
sars la bruyere:50.3719,3.8764
sars la buissiere:50.3353,4.2098
sart bernard:50.4052,4.9507
sart custinne:50.0015,4.9176
sart dames avelines:50.5542,4.4896
sart en fagne:50.1579,4.6199
sart eustache:50.3761,4.5998
sart lez spa:50.5174,5.9335
sart saint laurent:50.4027,4.7412
sautin:50.1638,4.2261
sautour:50.1694,4.5612
sauveniere:50.5811,4.7248
schaerbeek:50.8676,4.3737
schaffen:51.013,5.0868
schalkhoven:50.8423,5.4482
schaltin:50.3579,5.1237
schelderode:50.9699,3.7132
scheldewindeke:50.9393,3.7897
schelle:51.1246,4.3362
schellebelle:51.0103,3.9281
schendelbeke:50.7969,3.8989
schepdaal:50.8363,4.1951
scherpenheuvel:50.9726,4.9547
scherpenheuvel zichem:50.9689,4.9754
schilde:51.2571,4.5955
schoenberg:50.2888,6.2642
schoonaarde:50.9987,4.0159
schore:51.1111,2.8402
schorisse:50.8062,3.6782
schoten:51.2516,4.498
schriek:51.2907,4.4361
schuiferskapelle:51.037,3.3283
schulen:50.9533,5.1717
sclayn:50.4897,5.0285
scy:50.3079,5.2094
seilles:50.4984,5.0806
selange:49.6081,5.8484
seloignes:50.0161,4.2556
seneffe:50.5251,4.2665
sensenruth:49.8254,5.0739
seny:50.4595,5.4029
senzeille:50.1763,4.4662
septon:50.357,5.423
seraing:50.5966,5.5083
seraing le chateau:50.6216,5.2989
serinchamps:50.2319,5.2344
serskamp:50.99,3.931
serville:50.2501,4.7807
sibret:49.9683,5.6352
signeulx:49.5529,5.6404
sijsele:51.2105,3.3435
silenrieux:50.2251,4.4104
silly:50.6489,3.9244
sinaai waas:51.1867,3.9796
sinsin:50.2757,5.2624
sint agatha rode:50.7795,4.633
sint amands:51.0463,4.2107
sint amandsberg:51.0619,3.7489
sint andries:51.1883,3.175
sint antelinks:50.8495,3.9249
sint baafs vijve:50.9245,3.3863
sint blasius boekel:50.8516,3.7206
sint denijs:50.7644,3.3497
sint denijs boekel:50.8661,3.7131
sint denijs westrem:51.0199,3.6677
sint eloois vijve:50.9057,3.4036
sint eloois winkel:50.8765,3.1791
sint gillis dendermonde:51.0226,4.1277
sint gillis waas:51.2181,4.1233
sint goriks oudenhove:50.8523,3.7864
sint huibrechts hern:50.8293,5.4487
sint huibrechts lille:51.2253,5.4937
sint jan:50.8646,2.9038
sint jan in eremo:51.2682,3.5801
sint job in t goor:51.2956,4.5759
sint joris:51.13,2.7781
sint joris weert:50.8051,4.6458
sint joris winge:50.9122,4.8754
sint katelijne waver:51.0623,4.5114
sint katherina lombeek:50.8727,4.1536
sint kornelis horebeke:50.8356,3.6992
sint kruis:51.2142,3.2507
sint kruis winkel:51.1542,3.8234
sint kwintens lennik:50.8115,4.1456
sint lambrechts herk:50.9036,5.3119
sint laureins:51.233,3.5375
sint laureins berchem:50.7877,4.1994
sint lenaarts:51.3454,4.6782
sint lievens esse:50.8553,3.8871
sint lievens houtem:50.9197,3.8521
sint margriete:51.2677,3.5315
sint margriete houtem:50.8346,4.9624
sint maria horebeke:50.8383,3.6875
sint maria latem:50.8902,3.706
sint maria lierde:50.8217,3.837
sint maria oudenhove:50.8251,3.7999
sint martens bodegem:50.8627,4.2151
sint martens latem:51.0134,3.6306
sint martens leerne:51.0135,3.5838
sint martens lennik:50.8115,4.1695
sint martens lierde:50.8045,3.8158
sint michiels:51.1885,3.2112
sint niklaas:51.1638,4.1495
sint pauwels:51.1939,4.1017
sint pieters kapelle:50.7072,3.9986
sint pieters leeuw:50.7812,4.2452
sint pieters rode:50.9208,4.8292
sint rijkers:50.9945,2.6881
sint stevens woluwe:50.8662,4.436
sint truiden:50.8269,5.2034
sint ulriks kapelle:50.88,4.2207
sippenaeken:50.7509,5.9336
sirault:50.5061,3.7881
sivry:50.1679,4.1793
sivry rance:50.164,4.19
sleidinge:51.1319,3.6789
slijpe:51.1544,2.8477
slins:50.7277,5.5652
sluizen:51.1333,2.7568
smeerebbe vloerzegem:50.8162,3.9259
smetlede:50.9661,3.927
smuid:50.0188,5.2662
snaaskerke:51.1763,2.9334
snellegem:51.1755,3.123
soheit tinlot:50.4794,5.3767
sohier:50.0686,5.0703
soignies:50.5775,4.0733
soiron:50.5922,5.7906
solre saint gery:50.2162,4.2463
solre sur sambre:50.3068,4.1558
sombreffe:50.5247,4.6026
somme leuze:50.3366,5.3669
sommethonne:49.5765,5.4457
sommiere:50.2749,4.8455
somzee:50.2952,4.483
soree:50.4002,5.1259
sorinne la longue:50.3897,5.0294
sorinnes:50.2602,4.9824
sosoye:50.2956,4.7816
soulme:50.1873,4.7368
soumagne:50.6148,5.7399
soumoy:50.1897,4.4366
sourbrodt:50.4773,6.1144
souvret:50.451,4.3508
sovet:50.2963,5.0349
soy:50.2856,5.5101
soye:50.4495,4.7308
spa:50.4921,5.8626
spalbeek:50.949,5.2278
spiennes:50.4255,3.9869
spontin:50.3226,5.0069
sprimont:50.5066,5.6467
spy:50.4812,4.7027
stabroek:51.3352,4.3703
staden:50.9705,3.0013
stalhille:51.2197,3.073
stambruges:50.5083,3.7202
stave:50.2828,4.659
stavele:50.9398,2.6733
stavelot:50.3941,5.9308
steendorp:51.1311,4.2647
steenhuffel:50.9944,4.2625
steenhuize wijnhuize:50.8411,3.8904
steenkerke:51.0528,2.6895
steenkerque:50.6433,4.0699
steenokkerzeel:50.9093,4.511
stekene:51.2105,4.024
stembert:50.5931,5.8953
stene:51.2021,2.9201
sterrebeek:50.854,4.5157
stevoort:50.917,5.2444
stokkem:51.0198,5.7508
stokrooie:50.9709,5.2747
stoumont:50.407,5.8084
straimont:49.7962,5.3812
stree:50.2766,4.298
stree lez huy:50.4923,5.3272
strepy bracquegnies:50.4745,4.1207
strijpen:50.869,3.7893
strijtem:50.8406,4.1146
strombeek bever:50.911,4.3424
stuivekenskerke:51.0769,2.8234
suarlee:50.4883,4.778
sugny:49.814,4.9033
surice:50.1825,4.6963
suxy:49.7627,5.4006
tailles:50.2272,5.7448
taintignies:50.5502,3.3417
tamines:50.4341,4.6076
tarcienne:50.3119,4.4983
tavier:50.496,5.4708
taviers:50.6171,4.9319
tavigny:50.1081,5.8378
tellin:50.081,5.2168
templeuve:50.6449,3.2832
temploux:50.483,4.7509
temse:51.1421,4.2134
tenneville:50.0912,5.5242
teralfene:50.8921,4.0983
terhagen:51.0783,4.3994
termes:49.7071,5.458
ternat:50.8716,4.1834
tertre:50.4673,3.8082
tervuren:50.8228,4.5144
terwagne:50.4439,5.3492
tessenderlo:51.0682,5.0894
testelt:51.0193,4.9485
teuven:50.7532,5.8695
theux:50.5259,5.8199
thiaumont:49.716,5.7291
thieu:50.4734,4.0922
thieulain:50.618,3.6086
thieusies:50.5151,4.049
thimeon:50.4843,4.4307
thimister:50.6529,5.865
thimister clermont:50.663,5.8634
thimougies:50.6349,3.5103
thines:50.5868,4.3826
thirimont:50.2608,4.2364
thisnes:50.6656,5.0481
thommen:50.2191,6.0743
thon:50.4642,5.0134
thorembais les beguines:50.6584,4.8183
thorembais saint trond:50.6358,4.7839
thoricourt:50.6101,3.951
thuillies:50.2947,4.329
thuin:50.3397,4.287
thulin:50.4293,3.7393
thumaide:50.5404,3.6305
thy le chateau:50.2827,4.4279
thynes:50.2798,4.9883
thys:50.7225,5.3894
tiegem:50.8131,3.4698
tielen:51.2423,4.8965
tielrode:51.122,4.1737
tielt:50.9346,4.9156
tielt winge:50.9243,4.8864
tienen:50.8084,4.9464
tignee:50.6494,5.7043
tihange:50.5276,5.2594
tildonk:50.9408,4.6595
tilff:50.5613,5.5942
tillet:50.0098,5.5298
tilleur:50.6207,5.5307
tillier:50.5443,4.9463
tilly:50.5764,4.5522
tinlot:50.4777,5.3787
tintange:49.8786,5.7518
tintigny:49.6821,5.5185
tisselt:51.034,4.3598
toernich:49.6512,5.7795
tohogne:50.381,5.4814
tollembeek:50.7431,4.0048
tongeren:50.781,5.4648
tongerlo:51.1221,4.9013
tongre notre dame:50.5813,3.7748
tongre saint martin:50.586,3.7908
tongrinne:50.5157,4.6239
tontelange:49.7266,5.8099
torgny:49.5085,5.4735
torhout:51.0586,3.0913
tourinne:50.6395,5.1766
tourinnes la grosse:50.7778,4.7472
tourinnes saint lambert:50.6395,4.722
tournai:50.6057,3.3878
tournay:49.8543,5.397
tourpes:50.5727,3.6494
transinne:50.0004,5.2027
trazegnies:50.4665,4.3317
treignes:50.0923,4.6693
trembleur:50.6953,5.7268
tremelo:50.99,4.6755
trivieres:50.4517,4.1476
trognee:50.6878,5.1242
trois ponts:50.3727,5.8704
trooz:50.5728,5.6884
tubize:50.693,4.2047
turnhout:51.3234,4.9485
uccle:50.8018,4.3372
ucimont:49.8314,5.0574
uikhoven:50.9265,5.7199
uitbergen:51.0278,3.964
uitkerke:51.2997,3.1405
ulbeek:50.8432,5.2937
upigny:50.5756,4.8654
ursel:51.1286,3.4841
vaalbeek:50.8241,4.6853
val meer:50.7871,5.5971
vance:49.6702,5.6698
varendonk:51.0801,4.9552
varsenare:51.1992,3.1361
vaucelles:50.1132,4.7425
vaulx:50.5899,3.4262
vaulx lez chimay:50.0611,4.3636
vaux chavanne:50.3022,5.6969
vaux et borset:50.6132,5.2314
vaux lez rosieres:49.9134,5.5705
vaux sous chevremont:50.6019,5.6336
vaux sur sure:49.9088,5.5908
vechmaal:50.7609,5.3737
vedrin:50.502,4.8742
veerle:51.0592,4.9806
velaine sur sambre:50.4713,4.6072
velaines:50.6686,3.4866
veldegem:51.1049,3.1607
veldwezelt:50.8656,5.6324
vellereille le sec:50.4018,4.0573
vellereille les brayeux:50.379,4.1508
velm:50.78,5.1322
velroux:50.6437,5.4254
veltem beisem:50.9021,4.6255
velzeke ruddershove:50.8825,3.7826
vencimont:50.0324,4.9198
vergnies:50.1986,4.3059
verlaine:50.6075,5.3184
verlee:50.3675,5.2796
verrebroek:51.2541,4.1872
vertrijk:50.834,4.827
verviers:50.5932,5.8639
vesqueville:50.0058,5.3969
veulen:50.7634,5.3064
veurne:51.071,2.6549
vezin:50.4966,5.0115
vezon:50.5684,3.5018
viane:50.7387,3.9239
vichte:50.8353,3.4068
vielsalm:50.2884,5.917
viemme:50.6483,5.2683
viersel:51.1873,4.6503
vierset barse:50.4811,5.2949
vierves sur viroin:50.0803,4.6342
viesville:50.4906,4.403
vieux genappe:50.629,4.4015
vieux waleffe:50.6162,5.2045
vieuxville:50.3955,5.5512
villance:49.971,5.2221
ville en hesbaye:50.6183,5.1158
ville pommeroeul:50.4717,3.7304
ville sur haine:50.4768,4.0655
villerot:50.4862,3.7903
villers aux tours:50.4969,5.5123
villers deux eglises:50.1897,4.4827
villers devant orval:49.6186,5.3315
villers en fagne:50.1458,4.5846
villers l eveque:50.7028,5.4419
villers la bonne eau:49.9346,5.7478
villers la loue:49.5749,5.481
villers la tour:50.0354,4.2629
villers la ville:50.564,4.516
villers le bouillet:50.575,5.2619
villers le gambon:50.1905,4.6085
villers le peuplier:50.6565,5.0958
villers le temple:50.5081,5.3709
villers lez heest:50.5379,4.8346
villers notre dame:50.6179,3.7361
villers perwin:50.5262,4.4784
villers poterie:50.3513,4.5475
villers saint amand:50.6227,3.7307
villers saint ghislain:50.4312,4.0389
villers saint simeon:50.7098,5.5434
villers sainte gertrude:50.3619,5.5764
villers sur lesse:50.1443,5.105
villers sur semois:49.6987,5.5615
vilvoorde:50.9281,4.4329
vinalmont:50.5627,5.2261
vinderhoute:51.0876,3.6412
vinkem:51.0136,2.6571
vinkt:51.0079,3.4808
virelles:50.0648,4.333
virginal samme:50.6413,4.22
viroinval:50.0516,4.627
virton:49.5677,5.533
vise:50.7337,5.6955
vissenaken:50.8438,4.9111
vitrival:50.3942,4.6559
vivegnis:50.6979,5.6527
vivy:49.8676,5.0389
vladslo:51.0625,2.9208
vlamertinge:50.8472,2.8147
vleteren:50.9301,2.729
vlezenbeek:50.8056,4.236
vliermaal:50.8326,5.4259
vliermaalroot:50.8668,5.4299
vlierzele:50.9351,3.9009
vlijtingen:50.8329,5.5896
vlimmeren:51.2988,4.7822
vlissegem:51.2642,3.0636
vodecee:50.1972,4.5921
vodelee:50.1702,4.7323
vogenee:50.2399,4.4524
volkegem:50.8409,3.6356
vollezele:50.7609,4.0247
voneche:50.0609,4.98
voorde:50.8255,3.9455
voormezele:50.817,2.8758
voort:51.1674,4.6798
voroux goreux:50.6547,5.4271
voroux lez liers:50.6876,5.5525
vorselaar:51.2023,4.7695
vorsen:50.7052,5.1713
vorst:51.079,5.0188
vosselaar:51.3129,4.8878
vosselare:51.0289,3.5661
vossem:50.8349,4.5566
vottem:50.6727,5.5846
vrasene:51.2191,4.1944
vremde:51.1753,4.5226
vreren:50.752,5.4957
vresse sur semois:49.873,4.9341
vroenhoven:50.828,5.6375
vucht:50.977,5.7134
vurste:50.9459,3.6845
vyle et tharoul:50.4463,5.2683
waanrode:50.9129,5.0038
waarbeke:50.7779,3.9682
waardamme:51.1123,3.2223
waarloos:51.1053,4.453
waarmaarde:50.7904,3.4854
waarschoot:51.1515,3.6062
waasmont:50.7261,5.0609
waasmunster:51.1097,4.0842
wachtebeke:51.1702,3.8574
wadelincourt:50.5386,3.6484
wagnelee:50.5226,4.5273
waha:50.212,5.3442
waillet:50.2606,5.3042
waimes:50.4149,6.1118
wakken:50.9348,3.401
walcourt:50.2532,4.4348
walem:51.0658,4.4569
walhain:50.6183,4.6953
walhain saint paul:50.6168,4.6952
walhorn:50.6751,6.0469
walsbets:50.7385,5.0879
walshoutem:50.7182,5.087
waltwilder:50.8639,5.5465
wambeek:50.8567,4.1646
wancennes:50.092,4.961
wandre:50.6702,5.6597
wanfercee baulet:50.4758,4.5816
wange:50.7838,5.0303
wangenies:50.4777,4.5191
wanlin:50.1593,5.0615
wanne:50.3557,5.9214
wannebecq:50.6941,3.7998
wannegem lede:50.8902,3.5606
wansin:50.6786,5.0202
wanze:50.5333,5.2167
wanzele:50.9742,3.957
warchin:50.6096,3.4268
warcoing:50.7022,3.3452
wardin:49.9902,5.7858
waregem:50.8762,3.4257
waremme:50.6977,5.2546
waret l eveque:50.5558,5.0671
waret la chaussee:50.5417,4.9218
warisoulx:50.5348,4.8588
warnant:50.3238,4.8361
warnant dreye:50.5951,5.2254
warneton:50.753,2.9502
warquignies:50.4003,3.8224
warsage:50.7347,5.773
warzee:50.4488,5.4271
wasmes:50.4142,3.8466
wasmes audemez briffoeil:50.554,3.5352
wasmuel:50.4457,3.8467
wasseiges:50.6222,5.0064
waterland oudeman:51.2891,3.5905
waterloo:50.7174,4.3978
watermael boitsfort:50.7994,4.4158
watervliet:51.2776,3.627
watou:50.8452,2.6449
wattripont:50.7283,3.549
waudrez:50.4138,4.151
waulsort:50.2033,4.8632
wauthier braine:50.6808,4.3133
wavre:50.7164,4.6077
wavreille:50.1164,5.2419
wayaux:50.4896,4.4723
ways:50.627,4.4729
webbekom:50.9649,5.0544
wechelderzande:51.2654,4.7911
weelde:51.4121,5.0182
weerde:50.9723,4.4799
weert:51.1015,4.1856
wegnez:50.579,5.8176
weillen:50.2596,4.8245
welden:50.8791,3.6537
welkenraedt:50.6627,5.9723
welle:50.9005,4.0449
wellen:50.8435,5.3422
wellin:50.0823,5.1147
wemmel:50.9146,4.3109
wenduine:51.302,3.0928
wepion:50.4213,4.8634
werbomont:50.38,5.6868
werchter:50.9707,4.7027
weris:50.3266,5.5308
werken:51.029,2.9637
werm:50.8336,5.4805
wervik:50.7998,3.043
wespelaar:50.9565,4.6326
westende:51.1583,2.7778
westerlo:51.0867,4.9169
westkapelle:51.3208,3.3173
westkerke:51.1636,3.0047
westmalle:51.2994,4.6713
westmeerbeek:51.0604,4.8351
westouter:50.8003,2.741
westrem:50.9698,3.8614
westrozebeke:50.933,3.0096
westvleteren:50.9104,2.7206
wetteren:51.0069,3.8855
wevelgem:50.8121,3.1864
wez velvain:50.5468,3.3886
wezemaal:50.9483,4.7683
wezembeek oppem:50.8441,4.4872
wezeren:50.7322,5.1095
wibrin:50.1661,5.7156
wichelen:51.0021,3.9806
widooie:50.7719,5.4097
wiekevorst:51.1061,4.7854
wielsbeke:50.9114,3.3604
wierde:50.4286,4.9497
wiers:50.5087,3.533
wiesme:50.1488,4.9767
wieze:50.9786,4.0982
wiheries:50.3853,3.7521
wihogne:50.7277,5.5064
wijchmaal:51.1272,5.4147
wijer:50.8972,5.2233
wijgmaal:50.9264,4.7001
wijnegem:51.2271,4.5225
wijshagen:51.077,5.5325
wijtschate:50.7833,2.9126
wilderen:50.8177,5.1423
willaupuis:50.5666,3.6039
willebringen:50.8066,4.8387
willebroek:51.0627,4.3572
willemeau:50.574,3.35
willerzie:49.9874,4.8476
wilrijk:51.1638,4.3876
wilsele:50.9095,4.7136
wilskerke:51.1809,2.8401
wimmertingen:50.8769,5.3513
winenne:50.098,4.8931
wingene:51.0681,3.2848
winksele:50.9125,4.6404
wintershoven:50.8557,5.4073
witry:49.8589,5.6139
wodecq:50.7178,3.7444
woesten:50.9036,2.7888
wolkrange:49.635,5.7983
woluwe saint lambert:50.8467,4.4285
woluwe saint pierre:50.8292,4.4433
wolvertem:50.951,4.3085
wommelgem:51.2031,4.5238
wommersom:50.8124,5.0183
wonck:50.7677,5.6334
wondelgem:51.0935,3.7035
wontergem:50.9787,3.4443
wortegem:50.8534,3.5101
wortegem petegem:50.846,3.533
wortel:51.3975,4.8086
woubrechtegem:50.8727,3.9158
woumen:50.9949,2.8521
wulpen:51.0978,2.7073
wulvergem:50.7675,2.8409
wulveringem:51.0303,2.655
wuustwezel:51.3853,4.5652
xhendelesse:50.6037,5.7726
xhendremael:50.7044,5.4806
xhoris:50.444,5.6021
yernee fraineux:50.5284,5.382
yves gomezee:50.2393,4.4948
yvoir:50.3264,4.8807
zaffelare:51.1324,3.8602
zandbergen:50.8013,3.9673
zande:51.1174,2.9186
zandhoven:51.2148,4.6595
zandvliet:51.3598,4.2836
zandvoorde:51.2048,2.9668
zarlardinge:50.7643,3.8253
zarren:51.0181,2.9598
zaventem:50.8804,4.4746
zedelgem:51.1355,3.1404
zeebrugge:51.3314,3.2079
zegelsem:50.8136,3.7171
zele:51.0684,4.0386
zelem:50.9802,5.1093
zellik:50.8842,4.2744
zelzate:51.2,3.8105
zemst:50.9865,4.4441
zepperen:50.8403,5.2579
zerkegem:51.1713,3.0612
zetrud lumay:50.7592,4.8839
zevekote:51.1382,2.9017
zeveneken:51.1079,3.9
zeveren:50.9968,3.5032
zevergem:50.9787,3.6943
zichem:51.0086,4.985
zichen zussen bolder:50.7943,5.6153
zillebeke:50.8346,2.9224
zingem:50.9039,3.6538
zoerle parwijs:51.0881,4.8729
zoersel:51.2717,4.7133
zolder:51.0237,5.3135
zomergem:51.1196,3.5642
zonhoven:50.991,5.3678
zonnebeke:50.8732,2.9875
zonnegem:50.9302,3.9163
zottegem:50.8691,3.8155
zoutenaaie:51.0509,2.7515
zoutleeuw:50.8416,5.1186
zuidschote:50.913,2.8286
zuienkerke:51.2686,3.1567
zulte:50.9207,3.4486
zulzeke:50.7912,3.57
zutendaal:50.9319,5.5726
zwalm:50.8793,3.7193
zwevegem:50.8041,3.3419
zwevezele:51.0422,3.2054
zwijnaarde:51.0009,3.7022
zwijndrecht:51.2306,4.3189`;
/** "<postcode>:<lat>,<lng>" per line (localities under that code, averaged). */
const POSTCODE_DATA = `1000:50.8466,4.3517
1020:50.8834,4.3487
1030:50.8676,4.3737
1040:50.8369,4.3895
1050:50.8223,4.3816
1060:50.8267,4.3457
1070:50.8381,4.3123
1080:50.8544,4.3228
1081:50.8623,4.3257
1082:50.864,4.2927
1083:50.8712,4.3175
1090:50.8778,4.3261
1120:50.8978,4.3905
1130:50.892,4.4126
1140:50.8705,4.4022
1150:50.8292,4.4433
1160:50.8157,4.4331
1170:50.7994,4.4158
1180:50.8018,4.3372
1190:50.8091,4.3178
1200:50.8467,4.4285
1210:50.8531,4.3723
1300:50.7047,4.5908
1301:50.7112,4.5894
1310:50.7315,4.4797
1315:50.6986,4.7923
1320:50.777,4.7611
1325:50.6932,4.6925
1330:50.7134,4.5273
1331:50.7371,4.5463
1332:50.7207,4.4971
1340:50.6695,4.5748
1341:50.6626,4.5292
1342:50.6852,4.5549
1348:50.6742,4.6142
1350:50.6939,4.9619
1357:50.7471,4.9881
1360:50.6423,4.7918
1367:50.6563,4.8882
1370:50.7253,4.8584
1380:50.6759,4.4659
1390:50.7525,4.6885
1400:50.5912,4.309
1401:50.6172,4.3586
1402:50.5868,4.3826
1404:50.6049,4.2649
1410:50.7174,4.3978
1420:50.6941,4.3548
1421:50.6563,4.3508
1428:50.6484,4.3671
1430:50.6767,4.139
1435:50.6359,4.6234
1440:50.6809,4.29
1450:50.5931,4.6256
1457:50.6288,4.6967
1460:50.6438,4.2406
1461:50.6488,4.2965
1470:50.6147,4.4851
1471:50.5929,4.432
1472:50.629,4.4015
1473:50.6369,4.4465
1474:50.627,4.4729
1476:50.5763,4.411
1480:50.69,4.2007
1490:50.6443,4.5686
1495:50.5654,4.533
1500:50.7361,4.2374
1501:50.7379,4.2605
1502:50.7093,4.2143
1540:50.7355,4.0617
1541:50.7072,3.9986
1547:50.7164,3.9431
1560:50.7675,4.4744
1570:50.7522,4.0002
1600:50.7831,4.2135
1601:50.7849,4.2986
1602:50.8056,4.236
1620:50.7865,4.3174
1630:50.7716,4.3346
1640:50.745,4.3464
1650:50.7684,4.3051
1651:50.7651,4.273
1652:50.7449,4.3282
1653:50.7342,4.295
1654:50.7493,4.2733
1670:50.7419,4.1427
1671:50.7794,4.1742
1673:50.7355,4.1853
1674:50.7378,4.1601
1700:50.8623,4.2338
1701:50.8396,4.2501
1702:50.8714,4.2636
1703:50.8363,4.1951
1730:50.9102,4.2231
1731:50.8931,4.2767
1740:50.8716,4.1834
1741:50.8567,4.1646
1742:50.8727,4.1536
1745:50.956,4.1807
1750:50.8079,4.1672
1755:50.7776,4.1012
1760:50.8329,4.1015
1761:50.8482,4.1369
1770:50.8711,4.0861
1780:50.9146,4.3109
1785:50.9917,4.2063
1790:50.9017,4.1167
1800:50.9277,4.4441
1820:50.9199,4.4943
1830:50.9124,4.4354
1831:50.8946,4.4365
1840:51.0088,4.2684
1850:50.9503,4.4014
1851:50.9728,4.3778
1852:50.9527,4.3639
1853:50.911,4.3424
1860:50.9342,4.3287
1861:50.951,4.3085
1880:51.0016,4.3496
1910:50.9938,4.7263
1930:50.8827,4.4913
1932:50.8662,4.436
1933:50.854,4.5157
1950:50.8606,4.4691
1970:50.8441,4.4872
1980:50.974,4.4499
1981:50.9939,4.5043
1982:50.9709,4.4937
2000:51.2211,4.3997
2018:51.2211,4.3997
2020:51.2211,4.3997
2030:51.2211,4.3997
2040:51.3078,4.3232
2050:51.2211,4.3997
2060:51.2211,4.3997
2070:51.2167,4.3303
2100:51.2115,4.4695
2110:51.2271,4.5225
2140:51.2103,4.4404
2150:51.1929,4.489
2160:51.2031,4.5238
2170:51.2499,4.4453
2180:51.2842,4.4323
2200:51.1491,4.8319
2220:51.075,4.7192
2221:51.0472,4.7693
2222:51.1051,4.7586
2223:51.2907,4.4361
2230:51.0439,4.8677
2235:51.0606,4.8083
2240:51.2004,4.6485
2242:51.2257,4.7034
2243:51.2012,4.6975
2250:51.1439,4.8597
2260:51.1087,4.8991
2270:51.1392,4.7544
2275:51.2495,4.8297
2280:51.1887,4.7319
2288:51.1621,4.7371
2290:51.2023,4.7695
2300:51.3234,4.9485
2310:51.3495,4.7607
2320:51.3957,4.7441
2321:51.4609,4.7373
2322:51.4316,4.8071
2323:51.3975,4.8086
2328:51.4744,4.8052
2330:51.3581,4.8628
2340:51.3061,4.8099
2350:51.3129,4.8878
2360:51.3178,4.9817
2370:51.3202,5.0865
2380:51.3809,5.0198
2381:51.4121,5.0182
2382:51.4506,5.0488
2387:51.4128,4.9004
2390:51.3005,4.7065
2400:51.184,5.1155
2430:51.087,5.0078
2431:51.0697,4.9679
2440:51.1611,4.9903
2450:51.1317,5.0772
2460:51.238,4.9227
2470:51.2676,5.0844
2480:51.2396,5.1132
2490:51.1718,5.1938
2491:51.1337,5.1648
2500:51.112,4.5865
2520:51.1878,4.5906
2530:51.1597,4.5104
2531:51.1753,4.5226
2540:51.1486,4.4774
2547:51.1268,4.4922
2550:51.1198,4.4493
2560:51.1474,4.6675
2570:51.0957,4.5062
2580:51.06,4.6471
2590:51.1153,4.6643
2600:51.1918,4.4317
2610:51.1638,4.3876
2620:51.1442,4.3421
2627:51.1246,4.3362
2630:51.1333,4.387
2640:51.1742,4.4593
2650:51.1575,4.4384
2660:51.1758,4.3512
2800:51.0469,4.4641
2801:51.0519,4.4125
2811:51.0234,4.4181
2812:51.0083,4.5183
2820:51.0136,4.561
2830:51.0551,4.374
2840:51.0873,4.4098
2845:51.1099,4.3303
2850:51.0874,4.3667
2860:51.0623,4.5114
2861:51.0625,4.58
2870:51.0631,4.3047
2880:51.0909,4.2305
2890:51.0512,4.2339
2900:51.2516,4.498
2910:51.4678,4.4701
2920:51.3833,4.4763
2930:51.2931,4.4893
2940:51.3209,4.3875
2950:51.3328,4.4312
2960:51.3252,4.6171
2970:51.2598,4.5756
2980:51.2573,4.6794
2990:51.3923,4.604
3000:50.8813,4.693
3001:50.8517,4.6931
3010:50.8899,4.7308
3012:50.9095,4.7136
3018:50.9264,4.7001
3020:50.9075,4.6462
3040:50.7894,4.6155
3050:50.8218,4.6679
3051:50.8051,4.6458
3052:50.8282,4.7057
3053:50.8179,4.7284
3054:50.8241,4.6853
3060:50.8588,4.6311
3061:50.842,4.5905
3070:50.8833,4.5365
3071:50.9105,4.5751
3078:50.8755,4.5759
3080:50.8229,4.5387
3090:50.7729,4.5385
3110:50.9544,4.7143
3111:50.9483,4.7683
3118:50.9707,4.7027
3120:50.99,4.6755
3128:51.0075,4.7505
3130:51.0101,4.7867
3140:51.0049,4.6266
3150:50.9581,4.6436
3190:50.9783,4.5758
3191:50.9926,4.5553
3200:50.9756,4.8144
3201:51.0119,4.8857
3202:50.9759,4.897
3210:50.8905,4.8079
3211:50.8721,4.8909
3212:50.8721,4.7894
3220:50.9203,4.7901
3221:50.947,4.8338
3270:50.9707,4.9651
3271:51.0182,4.981
3272:51.0044,4.9366
3290:51.0004,5.0726
3293:50.9777,5.0299
3294:51.0072,5.0247
3300:50.8095,4.9442
3320:50.7887,4.8553
3321:50.7666,4.9194
3350:50.8181,5.0444
3360:50.837,4.7764
3370:50.8337,4.8399
3380:50.8618,4.9557
3381:50.8873,4.9609
3384:50.8695,4.9168
3390:50.9263,4.8845
3391:50.8951,4.9173
3400:50.8316,4.9638
3401:50.7287,5.0863
3404:50.7737,5.09
3440:50.8324,5.0997
3450:50.8853,5.1158
3454:50.8859,5.1565
3460:50.9403,4.9991
3461:50.9212,4.9541
3470:50.872,5.0223
3471:50.8668,5.0015
3472:50.8931,5.0065
3473:50.9129,5.0038
3500:50.917,5.3244
3501:50.8769,5.3513
3510:50.9507,5.2394
3511:50.9574,5.29
3512:50.917,5.2444
3520:50.991,5.3678
3530:51.0464,5.3893
3540:50.9457,5.1188
3545:50.9502,5.0941
3550:51.0295,5.2907
3560:50.9919,5.1623
3570:50.8755,5.308
3580:51.0502,5.2208
3581:51.0897,5.2444
3582:51.0698,5.2712
3583:51.0475,5.1617
3590:50.9078,5.42
3600:50.9655,5.5001
3620:50.8867,5.6435
3621:50.9284,5.6626
3630:50.9772,5.7045
3631:50.9337,5.7173
3640:51.1483,5.7662
3650:51.0357,5.7195
3660:51.043,5.582
3665:51.0005,5.5722
3668:51.0182,5.6162
3670:51.0934,5.553
3680:51.0809,5.7144
3690:50.9319,5.5726
3700:50.8238,5.2451
3717:50.7274,5.4261
3720:50.862,5.377
3721:50.8668,5.4299
3722:50.8557,5.4073
3723:50.8426,5.4006
3724:50.8326,5.4259
3730:50.8427,5.4688
3732:50.8423,5.4482
3740:50.859,5.5473
3742:50.8523,5.534
3746:50.8833,5.5561
3770:50.8079,5.5917
3790:50.7476,5.7989
3791:50.7284,5.8819
3792:50.7283,5.8242
3793:50.7532,5.8695
3798:50.7611,5.7719
3800:50.7952,5.2236
3803:50.8344,5.1516
3806:50.78,5.1322
3830:50.8334,5.3267
3831:50.827,5.3322
3832:50.8432,5.2937
3840:50.8274,5.3056
3850:50.8781,5.206
3870:50.7531,5.2987
3890:50.7284,5.1677
3891:50.7509,5.1864
3900:51.2113,5.423
3910:51.2271,5.4626
3920:51.2306,5.3077
3930:51.2593,5.5078
3940:51.1166,5.3416
3941:51.1568,5.344
3945:51.1065,5.1648
3950:51.1778,5.5564
3960:51.1368,5.6305
3970:51.1221,5.2639
3971:51.1158,5.2265
3980:51.0682,5.0894
3990:51.1376,5.4587
4000:50.6571,5.5543
4020:50.65,5.6186
4030:50.6218,5.5996
4031:50.6128,5.5954
4032:50.6111,5.6193
4040:50.6702,5.6404
4041:50.6816,5.5888
4042:50.6934,5.5638
4050:50.5848,5.647
4051:50.6019,5.6336
4052:50.559,5.6388
4053:50.5894,5.6192
4100:50.5855,5.522
4101:50.6168,5.505
4102:50.5993,5.539
4120:50.541,5.4719
4121:50.552,5.4514
4122:50.5447,5.5215
4130:50.5475,5.585
4140:50.5196,5.6556
4141:50.5248,5.7172
4160:50.4817,5.5225
4161:50.4969,5.5123
4162:50.4869,5.501
4163:50.496,5.4708
4170:50.4749,5.5765
4171:50.5098,5.5828
4180:50.4421,5.5486
4181:50.4268,5.5681
4190:50.4049,5.6036
4210:50.5812,5.0968
4217:50.5518,5.0967
4218:50.5332,5.1319
4219:50.6131,5.0255
4250:50.6734,5.1761
4252:50.6555,5.1969
4253:50.6649,5.187
4254:50.6617,5.1824
4257:50.7037,5.2139
4260:50.6151,5.1382
4261:50.6242,5.1632
4263:50.6395,5.1766
4280:50.6698,5.08
4287:50.7244,5.0221
4300:50.6954,5.2662
4317:50.6439,5.2493
4340:50.6905,5.4524
4342:50.6808,5.4556
4347:50.6621,5.4022
4350:50.6877,5.3343
4351:50.696,5.3427
4357:50.65,5.3265
4360:50.7249,5.3514
4367:50.7087,5.399
4400:50.6024,5.4504
4420:50.6313,5.5297
4430:50.6624,5.5191
4431:50.6652,5.5027
4432:50.6893,5.4968
4450:50.7088,5.5393
4451:50.6876,5.5525
4452:50.7279,5.5153
4453:50.7098,5.5434
4458:50.7219,5.5715
4460:50.6382,5.4576
4470:50.6001,5.3579
4480:50.5632,5.4008
4500:50.5175,5.2242
4520:50.5474,5.2032
4530:50.5969,5.2414
4537:50.6062,5.2987
4540:50.5536,5.3208
4550:50.518,5.3962
4557:50.4722,5.3772
4560:50.4142,5.3316
4570:50.4632,5.2473
4577:50.4798,5.3148
4590:50.451,5.4451
4600:50.7466,5.6914
4601:50.6958,5.686
4602:50.6828,5.6702
4606:50.6953,5.7536
4607:50.7208,5.7325
4608:50.7271,5.7747
4610:50.6346,5.6658
4620:50.6168,5.6832
4621:50.6303,5.6978
4623:50.6029,5.6811
4624:50.6068,5.6655
4630:50.6261,5.7236
4631:50.6418,5.7061
4632:50.6509,5.7262
4633:50.6461,5.737
4650:50.641,5.8026
4651:50.6483,5.8195
4652:50.6037,5.7726
4653:50.6614,5.7594
4654:50.6691,5.8048
4670:50.6834,5.7318
4671:50.6668,5.691
4672:50.6958,5.7008
4680:50.709,5.6318
4681:50.7105,5.6809
4682:50.7354,5.62
4683:50.6979,5.6527
4684:50.734,5.6668
4690:50.7647,5.6043
4700:50.6306,6.0315
4701:50.6461,6.0458
4710:50.6804,6.0073
4711:50.6751,6.0469
4720:50.7155,6.0133
4721:50.72,6.0241
4728:50.7091,6.0317
4730:50.6921,6.0908
4731:50.6936,6.0817
4750:50.442,6.2134
4760:50.3693,6.2989
4761:50.4344,6.3009
4770:50.3416,6.1795
4771:50.3632,6.2187
4780:50.3077,6.0845
4782:50.2888,6.2642
4783:50.2389,6.1651
4784:50.2591,6.0681
4790:50.1851,6.129
4791:50.2191,6.0743
4800:50.4076,5.7212
4801:50.5931,5.8953
4802:50.578,5.8675
4820:50.6114,5.8547
4821:50.4387,5.8902
4830:50.6123,5.9403
4831:50.6235,5.9212
4834:50.6086,5.9562
4837:50.6253,5.9834
4840:50.6627,5.9723
4841:50.6768,5.9318
4845:50.5383,5.9491
4850:50.722,5.9697
4851:50.7486,5.9652
4852:50.7232,5.9208
4860:50.5738,5.8041
4861:50.5922,5.7906
4870:50.5742,5.7121
4877:50.5901,5.748
4880:50.7041,5.8586
4890:50.6583,5.8707
4900:50.4921,5.8626
4910:50.5194,5.8281
4920:50.4605,5.6812
4950:50.4381,6.1223
4960:50.4328,6.0329
4970:50.4236,5.9418
4980:50.3558,5.8765
4983:50.358,5.8268
4987:50.4005,5.779
4990:50.3026,5.7861
5000:50.4625,4.8856
5001:50.4692,4.8223
5002:50.4814,4.8351
5003:50.4949,4.847
5004:50.4789,4.8917
5020:50.4834,4.8275
5021:50.4924,4.9292
5022:50.5172,4.9127
5024:50.4989,4.9597
5030:50.5635,4.7093
5031:50.5782,4.761
5032:50.5209,4.6829
5060:50.4428,4.6143
5070:50.3937,4.6616
5080:50.5005,5.0078
5081:50.5335,4.7887
5100:50.4269,4.9055
5101:50.4589,4.9296
5140:50.5137,4.6036
5150:50.4437,4.7477
5170:50.3746,4.8429
5190:50.4752,4.6734
5300:50.4819,5.0427
5310:50.5886,4.898
5330:50.3844,4.9813
5332:50.3469,4.9581
5333:50.3897,5.0294
5334:50.3731,5.0704
5336:50.3783,4.9845
5340:50.4246,5.0563
5350:50.4247,5.1476
5351:50.4406,5.1492
5353:50.4401,5.2218
5354:50.4433,5.1822
5360:50.3411,5.1078
5361:50.3128,5.2009
5362:50.3335,5.1752
5363:50.3254,5.1213
5364:50.3579,5.1237
5370:50.3611,5.2417
5372:50.3619,5.3339
5374:50.3533,5.3126
5376:50.3657,5.2494
5377:50.2962,5.3179
5380:50.5516,4.9844
5500:50.2337,4.9151
5501:50.2814,4.9715
5502:50.2798,4.9883
5503:50.2602,4.9824
5504:50.2472,4.9897
5520:50.2415,4.8006
5521:50.2501,4.7807
5522:50.2782,4.7934
5523:50.2673,4.835
5524:50.2453,4.8158
5530:50.3474,5.0299
5537:50.3186,4.8185
5540:50.2035,4.8322
5541:50.2151,4.8295
5542:50.1922,4.8353
5543:50.1617,4.8317
5544:50.1642,4.7943
5550:49.8564,4.9189
5555:49.9064,5.0117
5560:50.1745,4.9725
5561:50.2313,5.0058
5562:50.2118,5.0484
5563:50.1613,5.0372
5564:50.1593,5.0615
5570:50.0993,4.9318
5571:50.1488,4.9767
5572:50.1315,5.0409
5573:50.1176,5.0039
5574:50.0996,5.0088
5575:49.9928,4.9148
5576:50.0604,5.0006
5580:50.1548,5.1798
5590:50.2681,5.1145
5600:50.1884,4.6622
5620:50.2419,4.6526
5621:50.2937,4.5559
5630:50.1947,4.444
5640:50.3209,4.6703
5641:50.308,4.7055
5644:50.2975,4.7198
5646:50.2828,4.659
5650:50.2543,4.4261
5651:50.288,4.4502
5660:50.0337,4.4737
5670:50.0687,4.6317
5680:50.1411,4.7079
6000:50.4157,4.4492
6001:50.3977,4.4443
6010:50.3912,4.4686
6020:50.4186,4.4322
6030:50.4118,4.3786
6031:50.417,4.3824
6032:50.3902,4.4046
6040:50.4447,4.436
6041:50.4654,4.4302
6042:50.4319,4.4489
6043:50.4562,4.4816
6044:50.4415,4.3908
6060:50.427,4.4856
6061:50.4109,4.4729
6110:50.3691,4.3602
6111:50.3778,4.3496
6120:50.3248,4.4013
6140:50.4112,4.324
6141:50.4384,4.3198
6142:50.3974,4.3308
6150:50.408,4.2696
6180:50.4602,4.3763
6181:50.4876,4.3287
6182:50.451,4.3508
6183:50.4665,4.3317
6200:50.4035,4.5192
6210:50.5264,4.4463
6211:50.5046,4.4782
6220:50.4715,4.5288
6221:50.5112,4.5319
6222:50.5301,4.5614
6223:50.5226,4.5273
6224:50.4758,4.5816
6230:50.5105,4.3815
6238:50.5149,4.4066
6240:50.428,4.5395
6250:50.4098,4.5737
6280:50.355,4.5285
6440:50.1857,4.3316
6441:50.2119,4.3512
6460:50.0553,4.2756
6461:50.0648,4.333
6462:50.0611,4.3636
6463:50.0642,4.379
6464:49.9976,4.3676
6470:50.1623,4.2107
6500:50.2261,4.2427
6511:50.2766,4.298
6530:50.322,4.2659
6531:50.3207,4.308
6532:50.3082,4.2838
6533:50.3251,4.2591
6534:50.3332,4.3516
6536:50.2901,4.3205
6540:50.3613,4.2516
6542:50.3353,4.2098
6543:50.3512,4.2156
6560:50.2994,4.1449
6567:50.3284,4.186
6590:50.0286,4.165
6591:50.0521,4.2096
6592:50.0365,4.2241
6593:49.9755,4.1803
6594:50.0154,4.157
6596:49.9908,4.2538
6600:50.0032,5.7695
6630:49.8313,5.7376
6637:49.8787,5.7017
6640:49.934,5.6114
6642:49.8805,5.5493
6660:50.1468,5.7347
6661:50.3807,5.7679
6662:50.1081,5.8378
6663:50.0989,5.7385
6666:50.1661,5.7156
6670:50.1758,5.9472
6671:50.2244,5.9182
6672:50.2204,5.9973
6673:50.1807,5.8647
6674:50.1876,5.8289
6680:50.0251,5.5272
6681:50.0523,5.5136
6686:50.0334,5.6039
6687:50.0843,5.6676
6688:50.0535,5.6892
6690:50.2637,5.8626
6692:50.3074,5.9673
6698:50.3263,5.9073
6700:49.6864,5.7892
6704:49.7194,5.8534
6706:49.65,5.8676
6717:49.7412,5.7662
6720:49.7219,5.6414
6721:49.7721,5.6204
6723:49.7228,5.6225
6724:49.7185,5.5712
6730:49.6858,5.4943
6740:49.6816,5.5747
6741:49.6702,5.6698
6742:49.6535,5.6551
6743:49.6479,5.5942
6747:49.6181,5.6913
6750:49.5608,5.6693
6760:49.5637,5.5827
6761:49.5582,5.5705
6762:49.5578,5.5285
6767:49.5327,5.4881
6769:49.5942,5.4689
6780:49.6224,5.8167
6781:49.6081,5.8484
6782:49.6153,5.7608
6790:49.5675,5.8044
6791:49.5642,5.8318
6792:49.5747,5.7335
6800:49.9465,5.4234
6810:49.7095,5.3782
6811:49.7031,5.4263
6812:49.7627,5.4006
6813:49.7071,5.458
6820:49.7154,5.2409
6821:49.717,5.3183
6823:49.6186,5.3315
6824:49.7077,5.2622
6830:49.8151,5.0559
6831:50.6176,5.4123
6832:49.8254,5.0739
6833:49.8495,5.0481
6834:50.3913,6.013
6836:49.7974,5.1419
6838:49.7976,5.0065
6840:49.8445,5.4213
6850:49.8946,5.131
6851:49.8711,5.1221
6852:49.95,5.1504
6853:49.9186,5.1602
6856:49.8662,5.1607
6860:49.8161,5.5341
6870:50.0333,5.3345
6880:49.8427,5.2286
6887:49.7979,5.3156
6890:49.979,5.2297
6900:50.201,5.3201
6920:50.0754,5.0925
6921:50.0787,5.156
6922:50.0754,5.1374
6924:50.0762,5.0921
6927:50.0862,5.2339
6929:49.9999,5.0713
6940:50.3415,5.4547
6941:50.378,5.5058
6950:50.1516,5.3466
6951:50.1666,5.4155
6952:50.155,5.3829
6953:50.1255,5.298
6960:50.2873,5.6736
6970:50.0912,5.5242
6971:50.1078,5.5034
6972:50.1138,5.5508
6980:50.1766,5.5617
6982:50.2093,5.6395
6983:50.1249,5.6138
6984:50.1507,5.5783
6986:50.1717,5.502
6987:50.2234,5.5124
6990:50.2657,5.4395
6997:50.2475,5.5865
7000:50.455,3.952
7011:50.4761,3.9037
7012:50.4426,3.8886
7020:50.483,3.9587
7021:50.4643,4.0453
7022:50.416,3.9792
7024:50.4193,3.9438
7030:50.4366,4.0126
7031:50.4312,4.0389
7032:50.4255,3.9869
7033:50.4362,3.9207
7034:50.484,4.0122
7040:50.3686,3.9321
7041:50.3703,4.0068
7050:50.5296,3.9086
7060:50.5934,4.0573
7061:50.5141,4.026
7062:50.5537,4.1012
7063:50.5802,4.0004
7070:50.496,4.0969
7080:50.3962,3.8925
7090:50.6211,4.1472
7100:50.4587,4.1763
7110:50.4725,4.1221
7120:50.3808,4.096
7130:50.4198,4.1471
7131:50.4138,4.151
7133:50.3898,4.2055
7134:50.4204,4.1911
7140:50.4527,4.2481
7141:50.4362,4.2441
7160:50.4695,4.2885
7170:50.4908,4.2336
7180:50.5251,4.2665
7181:50.5528,4.2622
7190:50.5627,4.1787
7191:50.5704,4.1786
7300:50.4331,3.7961
7301:50.4338,3.8276
7320:50.4755,3.6505
7321:50.4903,3.6774
7322:50.4664,3.7206
7330:50.4484,3.8215
7331:50.4814,3.8328
7332:50.5183,3.79
7333:50.4673,3.8082
7334:50.4843,3.7776
7340:50.4084,3.8458
7350:50.4323,3.7235
7370:50.39,3.7725
7380:50.3982,3.6889
7382:50.383,3.7178
7387:50.3581,3.7274
7390:50.444,3.8552
7500:50.5867,3.3823
7501:50.605,3.3493
7502:50.5744,3.3038
7503:50.6195,3.357
7504:50.5779,3.3288
7506:50.574,3.35
7520:50.6481,3.3092
7521:50.5886,3.4213
7522:50.6113,3.3018
7530:50.5925,3.4834
7531:50.6157,3.4656
7532:50.6218,3.5029
7533:50.6349,3.5103
7534:50.6023,3.5457
7536:50.5899,3.4262
7538:50.5684,3.5018
7540:50.6387,3.453
7542:50.6554,3.4
7543:50.653,3.4452
7548:50.6096,3.4268
7600:50.5098,3.5909
7601:50.5292,3.5871
7602:50.5426,3.5946
7603:50.4976,3.6075
7604:50.5479,3.5486
7608:50.5087,3.533
7610:50.5558,3.3039
7611:50.5298,3.301
7618:50.5502,3.3417
7620:50.5355,3.3969
7621:50.5203,3.3881
7622:50.523,3.4419
7623:50.5067,3.3816
7624:50.517,3.3542
7640:50.5564,3.469
7641:50.5574,3.427
7642:50.5783,3.4372
7643:50.5679,3.4734
7700:50.741,3.2242
7711:50.7274,3.3037
7712:50.7227,3.2342
7730:50.6901,3.2917
7740:50.6939,3.343
7742:50.7009,3.3624
7743:50.6636,3.356
7750:50.742,3.5102
7760:50.7037,3.4577
7780:50.77,3.0003
7781:50.7868,2.9641
7782:50.7262,2.8803
7783:50.7061,2.89
7784:50.7559,2.9564
7800:50.6465,3.7985
7801:50.6202,3.7537
7802:50.5947,3.7516
7803:50.6477,3.7677
7804:50.6695,3.7711
7810:50.6151,3.806
7811:50.6104,3.8148
7812:50.6254,3.7144
7822:50.6564,3.8474
7823:50.6377,3.8878
7830:50.6429,3.9466
7850:50.691,4.0475
7860:50.7123,3.8301
7861:50.6901,3.8095
7862:50.7208,3.7802
7863:50.7283,3.8094
7864:50.7307,3.8522
7866:50.6914,3.8728
7870:50.575,3.9107
7880:50.7372,3.7379
7890:50.7158,3.7164
7900:50.6105,3.625
7901:50.618,3.6086
7903:50.599,3.6706
7904:50.5741,3.6097
7906:50.6061,3.5748
7910:50.6942,3.5524
7911:50.6566,3.6214
7912:50.7094,3.5822
7940:50.592,3.8677
7941:50.6102,3.8411
7942:50.6045,3.8507
7943:50.6068,3.8911
7950:50.5704,3.7765
7951:50.5813,3.7748
7970:50.5479,3.7361
7971:50.5372,3.6403
7972:50.5521,3.6839
7973:50.5064,3.7085
8000:51.2284,3.2274
8020:51.1145,3.2337
8200:51.1884,3.1931
8210:51.1321,3.1656
8211:51.118,3.0913
8300:51.3366,3.3036
8301:51.3127,3.2505
8310:51.2038,3.2539
8340:51.2598,3.3271
8370:51.3081,3.1351
8377:51.2547,3.1276
8380:51.3077,3.2121
8400:51.2124,2.9357
8420:51.262,3.0405
8421:51.2642,3.0636
8430:51.1833,2.8063
8431:51.1809,2.8401
8432:51.1747,2.8777
8433:51.1285,2.848
8434:51.1562,2.7664
8450:51.2389,2.9726
8460:51.1822,3.0207
8470:51.1512,2.9397
8480:51.1215,3.037
8490:51.1901,3.0967
8500:50.8179,3.2784
8501:50.837,3.2333
8510:50.7743,3.2741
8511:50.7775,3.2186
8520:50.8601,3.2736
8530:50.8293,3.3426
8531:50.8806,3.3058
8540:50.8388,3.3623
8550:50.8041,3.3419
8551:50.7822,3.412
8552:50.7754,3.3825
8553:50.8093,3.4245
8554:50.7644,3.3497
8560:50.8332,3.1813
8570:50.8343,3.451
8572:50.8122,3.4976
8573:50.8131,3.4698
8580:50.7755,3.4469
8581:50.7956,3.4957
8582:50.7587,3.4257
8583:50.748,3.4081
8587:50.7271,3.3589
8600:51.0235,2.9205
8610:51.027,2.9909
8620:51.1269,2.7626
8630:51.0461,2.6788
8640:50.9168,2.7469
8647:50.9641,2.7688
8650:50.9755,2.911
8660:51.0818,2.5851
8670:51.1107,2.6813
8680:51.0883,2.9501
8690:51.0033,2.7016
8691:50.9725,2.6573
8700:51.0139,3.3718
8710:50.9103,3.3591
8720:50.9478,3.4068
8730:51.1396,3.3411
8740:51.0105,3.2582
8750:51.0552,3.2451
8755:51.0628,3.3789
8760:50.9485,3.286
8770:50.922,3.2617
8780:50.9343,3.3468
8790:50.8762,3.4257
8791:50.8717,3.3427
8792:50.883,3.3669
8793:50.9057,3.4036
8800:50.9331,3.1385
8810:51.0303,3.1423
8820:51.0586,3.0913
8830:50.9899,3.0895
8840:50.9484,3.025
8850:50.9708,3.2046
8851:51.0075,3.2016
8860:50.8851,3.232
8870:50.9291,3.2065
8880:50.8718,3.1493
8890:50.8685,3.0894
8900:50.8511,2.8684
8902:50.8191,2.9122
8904:50.9031,2.8455
8906:50.8812,2.8086
8908:50.8472,2.8147
8920:50.9188,2.9181
8930:50.7867,3.1585
8940:50.8134,3.0559
8950:50.7567,2.8355
8951:50.7663,2.7833
8952:50.7675,2.8409
8953:50.7833,2.9126
8954:50.8003,2.741
8956:50.7952,2.8384
8957:50.7597,2.9001
8958:50.7837,2.7797
8970:50.8303,2.7429
8972:50.9033,2.6512
8978:50.8452,2.6449
8980:50.8544,2.9991
9000:51.0397,3.7142
9030:51.0731,3.6781
9031:51.0529,3.6395
9032:51.0935,3.7035
9040:51.0619,3.7489
9041:51.1002,3.7644
9042:51.141,3.8097
9050:51.041,3.7501
9051:51.025,3.6626
9052:51.0009,3.7022
9060:51.2,3.8105
9070:51.0422,3.7991
9080:51.1049,3.8666
9090:50.9936,3.7983
9100:51.1786,4.1637
9111:51.157,4.0918
9112:51.1867,3.9796
9120:51.2215,4.2434
9130:51.282,4.2273
9140:51.1289,4.1994
9150:51.1488,4.2957
9160:51.127,3.9791
9170:51.2318,4.1165
9180:51.1743,3.9446
9185:51.1702,3.8574
9190:51.2085,4.0506
9200:51.0224,4.0827
9220:51.075,4.1394
9230:50.9859,3.8735
9240:51.0684,4.0386
9250:51.1097,4.0842
9255:51.02,4.2071
9260:51.0008,3.9466
9270:51.0333,3.8845
9280:50.9934,4.1081
9290:51.0362,3.9774
9300:50.943,4.0396
9308:50.975,4.0356
9310:50.9542,4.1109
9320:50.9192,4.0317
9340:50.9648,3.9432
9400:50.8247,4.0065
9401:50.8169,3.9969
9402:50.8197,4.0459
9403:50.803,4.0607
9404:50.8422,3.9584
9406:50.8466,3.9977
9420:50.9389,3.8836
9450:50.8873,3.9888
9451:50.8846,3.9792
9470:50.8844,4.0665
9472:50.8747,4.0441
9473:50.9005,4.0449
9500:50.8173,3.8831
9506:50.797,3.9474
9520:50.9258,3.8751
9521:50.927,3.8813
9550:50.8671,3.8932
9551:50.8921,3.911
9552:50.9047,3.8946
9570:50.8077,3.8343
9571:50.8088,3.8639
9572:50.8045,3.8158
9600:50.7476,3.602
9620:50.8694,3.8106
9630:50.8812,3.7275
9636:50.8868,3.688
9660:50.8007,3.9867
9661:50.7849,3.7993
9667:50.8363,3.6929
9680:50.8058,3.6392
9681:50.7966,3.5955
9688:50.8062,3.6782
9690:50.7818,3.5217
9700:50.8563,3.617
9750:50.905,3.6141
9770:50.9201,3.5404
9771:50.8854,3.5108
9772:50.8902,3.5606
9790:50.8465,3.5419
9800:50.9906,3.5155
9810:50.9584,3.6191
9820:50.9681,3.7374
9830:51.0134,3.6306
9831:51.0001,3.6112
9840:50.9855,3.672
9850:51.0511,3.5536
9860:50.9516,3.7953
9870:50.9385,3.4665
9880:51.0598,3.441
9881:51.0903,3.4995
9890:50.9309,3.6893
9900:51.1845,3.5666
9910:51.1339,3.4482
9920:51.0957,3.6076
9921:51.0876,3.6412
9930:51.1196,3.5642
9931:51.1509,3.5253
9932:51.1304,3.5532
9940:51.1437,3.7166
9950:51.1515,3.6062
9960:51.23,3.7568
9961:51.2509,3.706
9968:51.2121,3.6834
9970:51.229,3.6219
9971:51.1942,3.6346
9980:51.233,3.5375
9981:51.2677,3.5315
9982:51.2682,3.5801
9988:51.2834,3.6088
9990:51.2263,3.4155
9991:51.2035,3.4858
9992:51.2558,3.4071`;

function parseTable(raw: string): Record<string, LatLng> {
  const out: Record<string, LatLng> = {};
  for (const line of raw.split("\n")) {
    const c = line.indexOf(":");
    if (c < 0) continue;
    const comma = line.indexOf(",", c);
    out[line.slice(0, c)] = {
      lat: Number(line.slice(c + 1, comma)),
      lng: Number(line.slice(comma + 1)),
    };
  }
  return out;
}

const PLACES: Record<string, LatLng> = parseTable(PLACE_DATA);
const POSTCODES: Record<string, LatLng> = parseTable(POSTCODE_DATA);

/**
 * Cross-language / common variants that differ from the dataset's local name.
 * Each value is a normalised key that exists in PLACES.
 */
const ALIASES: Record<string, string> = {
  // English exonyms
  antwerp: "antwerpen",
  brussels: "bruxelles",
  "brussels city": "bruxelles",
  ghent: "gent",
  bruges: "brugge",
  ostend: "oostende",
  ypres: "ieper",
  louvain: "leuven",
  // Dutch names for Walloon / Brussels places
  brussel: "bruxelles",
  luik: "liege",
  bergen: "mons",
  namen: "namur",
  doornik: "tournai",
  nijvel: "nivelles",
  aarlen: "arlon",
  bastenaken: "bastogne",
  hoei: "huy",
  edingen: "enghien",
  waver: "wavre",
  elsene: "ixelles",
  ukkel: "uccle",
  vorst: "forest",
  schaarbeek: "schaerbeek",
  "sint gillis": "saint gilles",
  "sint jans molenbeek": "molenbeek saint jean",
  "sint lambrechts woluwe": "woluwe saint lambert",
  "sint pieters woluwe": "woluwe saint pierre",
  // French names for Flemish places
  anvers: "antwerpen",
  gand: "gent",
  courtrai: "kortrijk",
  malines: "mechelen",
  termonde: "dendermonde",
  alost: "aalst",
  furnes: "veurne",
  "saint nicolas": "sint niklaas",
  "saint trond": "sint truiden",
  tirlemont: "tienen",
  audenarde: "oudenaarde",
  grammont: "geraardsbergen",
  "la panne": "de panne",
};

/** lowercase, strip accents, drop punctuation, collapse whitespace. */
function normalise(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Postcode ranges -> coordinate. Ultimate fallback for a 4-digit code we have no
 * exact centre for (rare — POSTCODE_DATA covers ~1145 codes).
 */
const POSTCODE_BUCKETS: { lo: number; hi: number; at: LatLng }[] = [
  { lo: 1000, hi: 1299, at: { lat: 50.8467, lng: 4.3525 } },
  { lo: 1300, hi: 1499, at: { lat: 50.6689, lng: 4.6 } },
  { lo: 1500, hi: 1999, at: { lat: 50.85, lng: 4.3 } },
  { lo: 2000, hi: 2999, at: { lat: 51.2194, lng: 4.4025 } },
  { lo: 3000, hi: 3499, at: { lat: 50.8798, lng: 4.7005 } },
  { lo: 3500, hi: 3999, at: { lat: 50.9307, lng: 5.3378 } },
  { lo: 4000, hi: 4999, at: { lat: 50.6326, lng: 5.5797 } },
  { lo: 5000, hi: 5999, at: { lat: 50.4674, lng: 4.8719 } },
  { lo: 6000, hi: 6599, at: { lat: 50.4114, lng: 4.4447 } },
  { lo: 6600, hi: 6999, at: { lat: 50.0028, lng: 5.7186 } },
  { lo: 7000, hi: 7999, at: { lat: 50.4542, lng: 3.9564 } },
  { lo: 8000, hi: 8999, at: { lat: 51.05, lng: 3.1 } },
  { lo: 9000, hi: 9999, at: { lat: 51.0543, lng: 3.7174 } },
];

function lookupName(key: string): LatLng | null {
  if (PLACES[key]) return PLACES[key]!;
  const alias = ALIASES[key];
  if (alias && PLACES[alias]) return PLACES[alias]!;
  return null;
}

/**
 * Resolve a free-text Belgian location ("Hoogstraten", "2320", "2320 Meer",
 * "Gent, BE") to an approximate coordinate, or `null` if it cannot be placed.
 */
export function resolvePlace(input: string | null | undefined): LatLng | null {
  if (!input) return null;
  const norm = normalise(input);
  if (!norm) return null;

  const direct = lookupName(norm);
  if (direct) return direct;

  const noBe = norm.replace(/ (be|belgium|belgie|belgique)$/, "").trim();
  if (noBe !== norm) {
    const hit = lookupName(noBe);
    if (hit) return hit;
  }

  // A 4-digit postcode anywhere in the string.
  const pc = norm.match(/\b(\d{4})\b/);
  if (pc) {
    const code = pc[1]!;
    if (POSTCODES[code]) return POSTCODES[code]!;
    const rest = normalise(norm.replace(code, " "));
    const restHit = rest ? lookupName(rest) : null;
    if (restHit) return restHit;
    const n = Number(code);
    const bucket = POSTCODE_BUCKETS.find((b) => n >= b.lo && n <= b.hi);
    if (bucket) return bucket.at;
  }

  // Token match: any 3+ char word that is itself a known place.
  for (const tok of noBe.split(" ")) {
    if (tok.length >= 3) {
      const hit = lookupName(tok);
      if (hit) return hit;
    }
  }
  return null;
}

/** Count of known locality centres (diagnostics / admin coverage report). */
export function knownPlaceCount(): number {
  return Object.keys(PLACES).length;
}

/** All known locality centres — used by the admin coverage report. */
export function allPlaces(): { name: string; lat: number; lng: number }[] {
  return Object.entries(PLACES).map(([name, c]) => ({
    name,
    lat: c.lat,
    lng: c.lng,
  }));
}
