/* /myself — the public pre-programme self-discovery link.
   Same engine and same participant journey as /testme; what differs is the
   question bank (version myself-v1, written for people who are not agents yet)
   and the front door, which needs no event code.

   The note under the Start button is not decoration. This form is filled in by
   people considering the Leadership Programme, so it has to say plainly that it
   does not decide who is accepted — a self-report questionnaire cannot carry
   that weight, and a person deciding their career deserves to know what they
   are filling in. Human decisions stay with the humans. */
import TestMe from './TestMe'
import type { TLang } from './talentText'

const BLURB: Partial<Record<TLang, string>> = {
  en: 'Before we meet, tell us how you naturally work. There are no right or wrong answers, no pass and no fail — it simply helps us have a better conversation with you.',
  'ms-MY': 'Sebelum kita bertemu, kongsikan cara anda bekerja secara semula jadi. Tiada jawapan betul atau salah, tiada lulus atau gagal — ia hanya membantu kita berbual dengan lebih baik.',
  'id-ID': 'Sebelum kita bertemu, ceritakan cara Anda bekerja secara alami. Tidak ada jawaban benar atau salah, tidak ada lulus atau gagal — ini hanya membantu kita berbincang lebih baik.',
}

const NOTE: Partial<Record<TLang, string>> = {
  en: 'This is not a test and it does not decide whether you are accepted. Your answers are used to understand what you need and to guide the conversation. You choose what is shared.',
  'ms-MY': 'Ini bukan ujian dan ia tidak menentukan sama ada anda diterima. Jawapan anda digunakan untuk memahami keperluan anda dan memandu perbualan. Anda yang memilih apa yang dikongsi.',
  'id-ID': 'Ini bukan tes dan tidak menentukan apakah Anda diterima. Jawaban Anda dipakai untuk memahami kebutuhan Anda dan memandu percakapan. Anda yang memilih apa yang dibagikan.',
}

export default function Myself() {
  return (
    <TestMe
      fixedCode="MYSELF"
      brandTitle={<>Know <span className="gold-text">Yourself</span></>}
      brandSub="IQI AG Hero"
      blurb={BLURB}
      note={NOTE}
    />
  )
}
