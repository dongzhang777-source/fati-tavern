export type StoryPackErrorCode =
  | 'SP-MAN-001'
  | 'SP-MAN-002'
  | 'SP-MAN-003'
  | 'SP-MAN-004'
  | 'SP-MAN-010'
  | 'SP-MAN-011'
  | 'SP-MAN-012'
  | 'SP-MAN-013'
  | 'SP-MAN-014'
  | 'SP-MAN-015'
  | 'SP-MAN-016'
  | 'SP-MAN-017'
  | 'SP-MAN-018'
  | 'SP-MAN-019'
  | 'SP-DAG-101'
  | 'SP-DAG-102'
  | 'SP-DAG-104'
  | 'SP-DAG-105'
  | 'SP-DAG-106'
  | 'SP-DAG-107'
  | 'SP-DAG-108'
  | 'SP-DAG-109'
  | 'SP-DAG-110'
  | 'SP-DAG-111'
  | 'SP-DAG-112'
  | 'SP-REF-201'
  | 'SP-REF-202'
  | 'SP-REF-203'
  | 'SP-REF-204'
  | 'SP-REF-205'
  | 'SP-REF-206'
  | 'SP-REF-207'
  | 'SP-REF-208'
  | 'SP-REF-209'
  | 'SP-REF-210'
  | 'SP-REF-211'
  | 'SP-REF-212'
  | 'SP-MED-301'
  | 'SP-MED-302'
  | 'SP-MED-303'
  | 'SP-MED-304'
  | 'SP-MED-305'
  | 'SP-MED-306'
  | 'SP-MED-307'
  | 'SP-MED-308'
  | 'SP-EMB-401'
  | 'SP-EMB-402'
  | 'SP-EMB-403'
  | 'SP-EMB-404'
  | 'SP-BLK-501'
  | 'SP-BLK-502'
  | 'SP-BLK-503'
  | 'SP-BLK-504'
  | 'SP-BLK-505'
  | 'SP-BLK-506'
  | 'SP-BLK-507'
  | 'SP-BLK-508'
  | 'SP-BLK-509'
  | 'SP-RAT-601'
  | 'SP-RAT-602'
  | 'SP-RAT-603'
  | 'SP-RAT-604'
  | 'SP-RAT-605'
  | 'SP-RAT-606'
  | 'SP-TXT-701'
  | 'SP-TXT-702'
  | 'SP-TXT-703'
  | 'SP-TXT-704'
  | 'SP-TXT-705'
  | 'SP-CHO-801'
  | 'SP-CUE-901'
  | 'SP-CUE-902'
  | 'SP-CUE-903'
  | 'SP-CUE-904'
  | 'SP-CUE-905'
  | 'SP-CUE-906'
  | 'SP-CUE-907'
  | 'SP-CUE-908'

export interface StoryPackError {
  ok: false
  code: StoryPackErrorCode
  file: string
  pointer: string
  note?: string
}

export interface StoryPackSuccess<TValue> {
  ok: true
  value: TValue
}

export type StoryPackResult<TValue> = StoryPackSuccess<TValue> | StoryPackError

export function packError(
  code: StoryPackErrorCode,
  file: string,
  pointer = '',
  note?: string,
): StoryPackError {
  return note === undefined ? { ok: false, code, file, pointer } : { ok: false, code, file, pointer, note }
}
