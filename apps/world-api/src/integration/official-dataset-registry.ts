/** Frozen selected-source JSON registry. Hashes and byte counts are from the
 * owner-selected BALANCED_2026_09_28_V1 CHECKSUMS.json, not HTTP inputs. */
const DATASETS = `
assumptions|2061|92fc7883367f11ceea3a6151cb8459c6733b86da7c33c58664be7fad616c39ae|OBJECT
changes|26863|034ff4d1b7b2f57bb4f4b50d83a94f9b515ef8e0b2183448c0a9d7caa88cf0cc|ARRAY
commodity-catalog|1933|b1f9a100bdb80627e31801ffaf1b2c7863a2996cedba0344de8a899c616eff2b|ARRAY
countries|146348|5d493e93dfab1425731191ba7491cce47949d176e4769b33fdca48d2d31dba89|ARRAY
coverage|1686|c7f9b9de8ebb03faeb79d2987b0377086245986040360a6f20227fa2ea3b6bd1|ARRAY
deposits|254092|62076847d10529da672de8a97607dd98387be459cf6fd617c24d33f29875f516|ARRAY
domestic-access|507222|2b8e6102479031314ca91560a81f485edb671ab74d233c70e1da40da0be32a09|ARRAY
employment|42708|f5e5f79d9d0453f291c05840ee468fa71b7e021e29a79766cc75530a1986155f|ARRAY
entities|82043|d53e64a28110ea3615d42be03fc740a2fe72b55e6aeb5d4a584f5d2c117a6593|ARRAY
facilities|1897241|049e39330646048b95636d3a075fc1423ee62762999184a2326df161a198b485|ARRAY
facility-map-links|398428|3152c4e62a950adf3c214c69580f754079837f124fc1a0e6f09b72b1793cb5e8|ARRAY
finance|89045|4f30d7dd43aa2190604d4fb73c776a8d4aaa263653dc783def6f7c2c5cc80805|ARRAY
geography|8441668|c1a3d521ae91b37845f764be4ede73d522bc6958be90f4676ad5a19395b26a35|GEOGRAPHY
hazard-proposals|119358|ff4f3f57ad12a03fca93dd457075cc049b87c4852bb20a0de63adec35900fb45|ARRAY
illustration-links|43893|e461af7fd390a351d9f57b439a1d092089238cada20de7fab594675fc9167271|OBJECT
land-program|20679|b8422e551cb4f175280c6d2613bed2acb64ded84c8933e6da3dac0c62a92befa|ARRAY
license-proposals|93691|f9a09308b8fcf10f58bc8484beab78b005fa9ee06e02a895fcd81f885597f323|ARRAY
manifest|3319|b1072645a6ade9eb48b0d105bf38b2c475a9b667f2f14224c805fef88be3befb|OBJECT
nodes|228393|32809165710ca830d21126537c8ff68b90100b3fd3b2eeaf323a16f0f3778962|ARRAY
opening-material-reconciliation|2100|bb7e7ce2e4a4bb322f98a87411b5e7a7599ed7392e965f516778dc9ec37458f8|ARRAY
population-services|56412|86e828a421346aecaa31c95a7805289a022c80df93399545aeea39f6ce361615|ARRAY
power|39232|81e910b36558260e0372f6b00474147e431ed502387b78bfdcc0d8dd2f26713e|ARRAY
production-plans|157825|3b869cdccae4373a5043554e1985a45a19e3ac6bebc8a67671791f4d01e09d04|ARRAY
recipes|4940|205259654c754d2ebe6e774f3a902f367455bdff4a51f7b0449e0d74334aeb7c|ARRAY
regions|652112|42ef418d90c3f448d390ad9e62971065eb29c3d96fdb4f3dde5fc33ae0cb2bdd|ARRAY
seasonal-water|62791|704f59f6204096b1f696d9d35c8727845a92f44efd8948b87eda0e740845fc66|ARRAY
settlements|94070|2499806f3d66b4b68571396c80de6d88bfb813674581c59df758a160d29a25cc|ARRAY
stocks|303774|d52e68856dabdda6d5488043291ee92100f22c16ea44d34d2000170402ee8153|ARRAY
supplier-concentration-policy|1942|afdb63dc19aeff6a738c3279c00da1939b62d0143d7a4b89619615a4ca0dec55|ARRAY
technology-proposals|25196|111f7b54d0a8dfff31479c14169645d750e5928b03a050f323792b458fef54bb|ARRAY
trade-plans|520880|c3c8c74dc81d13c0115fd1b5fff1b6f886fd79b3b6ba60b9659b126b0db928cd|ARRAY
transit-proposals|27257|d5b1293e447fef3bb87052cf808222ed2c482779d202250611b289c7165f18ba|ARRAY
transport-routes|3487702|a55863d91f7fafcfb7776cfb6c6bb94636d4156f59bf8bf20777023bdbba6f66|ARRAY
water-allocations|54600|53b4d7cd0425f6a0789cad2e1bcd0800420a5010f38307e895742df1c0567841|ARRAY
`.trim();

export type OfficialDatasetKind = 'ARRAY' | 'OBJECT' | 'GEOGRAPHY';

export interface OfficialDatasetSpec {
  readonly slug: string;
  readonly sourcePath: string;
  readonly storagePath: string;
  readonly sha256: string;
  readonly bytes: number;
  readonly kind: OfficialDatasetKind;
  readonly countryFields: readonly string[];
  readonly entityFields: readonly string[];
  readonly referenceFields: readonly string[];
}

const ASSOCIATIONS: Readonly<
  Record<
    string,
    {
      readonly country?: readonly string[];
      readonly entity?: readonly string[];
      readonly reference?: readonly string[];
    }
  >
> = {
  changes: { reference: ['objectId'] },
  countries: { country: ['id'] },
  deposits: { country: ['countryId'], reference: ['provinceId'] },
  'domestic-access': { country: ['countryId'], reference: ['fromId', 'toId'] },
  employment: { country: ['countryId'] },
  entities: { country: ['countryId'], entity: ['id'] },
  facilities: {
    country: ['countryId'],
    entity: ['operatorId', 'ownerId'],
    reference: ['regionId', 'projectId'],
  },
  'facility-map-links': { country: ['countryId'], reference: ['facilityId'] },
  finance: { country: ['countryId'] },
  'hazard-proposals': { country: ['countryId'], reference: ['regionId'] },
  'land-program': { country: ['countryId'], reference: ['regionId'] },
  'license-proposals': {
    country: ['countryId'],
    entity: ['grantorId', 'holderId'],
  },
  nodes: { country: ['countryId'], reference: ['regionId'] },
  'population-services': { country: ['countryId'], reference: ['regionId'] },
  power: { country: ['countryId'] },
  'production-plans': { country: ['countryId'] },
  regions: { country: ['countryId'] },
  'seasonal-water': { reference: ['regionId', 'basinId'] },
  settlements: { country: ['countryId'], reference: ['regionId'] },
  stocks: {
    country: ['countryId'],
    entity: ['ownerId'],
    reference: ['warehouseId'],
  },
  'technology-proposals': { country: ['countryId'], entity: ['holderId'] },
  'trade-plans': {
    country: ['sellerCountryId', 'buyerCountryId'],
    entity: ['sellerEntityId', 'buyerEntityId'],
  },
  'transit-proposals': { country: ['countryIds'], reference: ['flowId'] },
  'transport-routes': {
    country: [
      'fromCountryId',
      'toCountryId',
      'portCountryIds',
      'transitCountryIds',
    ],
    reference: ['fromNodeId', 'toNodeId'],
  },
  'water-allocations': {
    country: ['countryId'],
    reference: ['regionId', 'basinId'],
  },
};

export const OFFICIAL_DATASETS: readonly OfficialDatasetSpec[] = Object.freeze(
  DATASETS.split('\n').map((line) => {
    const [slug, bytesText, sha256, kind] = line.split('|');
    if (
      !slug ||
      !bytesText ||
      !sha256 ||
      !kind ||
      !/^[a-z][a-z-]+$/u.test(slug) ||
      !/^[0-9a-f]{64}$/u.test(sha256) ||
      !['ARRAY', 'OBJECT', 'GEOGRAPHY'].includes(kind)
    ) {
      throw new Error('OFFICIAL_DATASET_REGISTRY_INVALID');
    }
    const sourcePath = `data/${slug}.json`;
    const association = ASSOCIATIONS[slug] ?? {};
    return Object.freeze({
      slug,
      sourcePath,
      storagePath: `source/${Buffer.from(sourcePath, 'utf8').toString('hex')}`,
      sha256,
      bytes: Number(bytesText),
      kind: kind as OfficialDatasetKind,
      countryFields: association.country ?? [],
      entityFields: association.entity ?? [],
      referenceFields: association.reference ?? [],
    });
  }),
);

export const OFFICIAL_DATASET_BY_SLUG: ReadonlyMap<
  string,
  OfficialDatasetSpec
> = new Map(OFFICIAL_DATASETS.map((dataset) => [dataset.slug, dataset]));
