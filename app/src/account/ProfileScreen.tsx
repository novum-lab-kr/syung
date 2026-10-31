// 프로필 수정(웹 #profileSheet ProfileForm — 아래에서 올라오는 시트 · 닫기 ✕ · 닉네임 칸 · 사진 · 캐릭터 고르기 · 취소 · 저장). 웹처럼 사진 → 이름 차례로 보내고 실패 글도 같다.
// 사진 올리기는 후속으로 미루고 그 자리에 웹 안내 한 줄만 둔다. 지금 사진이면 그대로 두고 캐릭터를 고르면 바꾼다.
import { router } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { tokens } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';
import { call, errorMessage, meOf, type Me } from './api';
import { CloseIcon } from './icons';
import { form } from './literals';
import { setMe, useSession } from './session';
import { body, makeStyles } from './style';
import { showToast } from './toast';
import { AvatarFace, BottomSheet, CHARACTERS, faceUrl, goBack, Message } from './ui';

const useStyles = makeStyles(theme => {
  const dark = theme.name === 'dark';
  const button = { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: tokens.radius[12] } as const;
  return {
    close: { position: 'absolute', top: 10, right: 10, zIndex: 1, width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20, backgroundColor: theme.color.control },
    body: { paddingTop: 30 },
    field: {
      flexDirection: 'row', alignItems: 'center', gap: tokens.space[2], minHeight: 48, paddingHorizontal: 14, marginBottom: tokens.space[2], borderWidth: 2,
      borderColor: dark ? theme.color.rule : form.edge, borderRadius: tokens.radius[14], backgroundColor: dark ? theme.color.control : form.back,
    },
    input: { ...body(theme, tokens.text[16], tokens.weight.bold, dark ? theme.color.ink : form.ink), flex: 1, paddingVertical: 0, paddingHorizontal: 2 },
    count: body(theme, tokens.text[12], tokens.weight.regular, dark ? theme.color.secondary : form.label),
    over: { color: form.danger, fontWeight: tokens.weight.bold },
    pick: { marginBottom: 14, padding: tokens.space[3], borderRadius: tokens.radius[18], backgroundColor: theme.color.control },
    label: { ...body(theme, tokens.text[12], tokens.weight.bold, theme.color.muted), marginBottom: tokens.space[2] },
    choices: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.space[2] },
    choice: {
      width: '23.1%', aspectRatio: 1, minHeight: 56, alignItems: 'center', justifyContent: 'center', borderRadius: tokens.radius[16],
      backgroundColor: theme.color.paper, boxShadow: `inset 0 0 0 1.5px ${theme.color.rule}`,
    },
    chosen: { boxShadow: `inset 0 0 0 3px ${theme.color.syungDeep}` },
    face: { width: '78%', height: '78%' },
    note: { ...body(theme, tokens.text[11], tokens.weight.regular, theme.color.muted), lineHeight: tokens.text[11] * 1.45, marginTop: tokens.space[2], marginHorizontal: 2 },
    row: { flexDirection: 'row', gap: tokens.space[2] },
    cancel: { ...button, backgroundColor: theme.color.control },
    save: { ...button, backgroundColor: theme.color.syung },
    cancelText: body(theme, tokens.text[16], tokens.weight.bold),
    saveText: body(theme, tokens.text[16], tokens.weight.bold, theme.color.syungInk),
    locked: { opacity: 0.5 },
    message: { ...body(theme, tokens.text[12], tokens.weight.regular, theme.color.secondary), marginTop: 10, minHeight: tokens.text[12] * 1.4, textAlign: 'center' },
  };
});

export const NAME_MAX = 12;
const nameLength = (text: string) => [...text.trim()].length;
// 지금 고른 프로필: 캐릭터 id · 올린 사진 'photo' · 기본 새싹(웹 currentChoice)
function currentChoice(me: Me): string {
  if (me.avatar?.type === 'character') return me.avatar.id;
  return me.avatar?.type === 'photo' ? 'photo' : 'sprout';
}

export function ProfileScreen() {
  const styles = useStyles();
  const theme = useTheme();
  const session = useSession();
  const me = session.status === 'in' ? session.me : null;
  const [name, setName] = useState(me?.name ?? '');
  const [character, setCharacter] = useState<string | null>(null);   // null = 그대로
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (!me) {
    return <BottomSheet still onClose={goBack}><Message>로그인한 뒤 바꿀 수 있어요.</Message></BottomSheet>;
  }
  const current = currentChoice(me);
  const chosen = character ?? current;
  const count = nameLength(name);

  const save = async () => {
    if (saving) return;
    const trimmed = name.trim();
    const nameChanged = trimmed !== me.name;
    const avatarChanged = character !== null && character !== current;
    if (nameChanged && (count < 1 || count > NAME_MAX)) { setMessage(`닉네임은 1~${NAME_MAX}자예요`); return; }
    if (!nameChanged && !avatarChanged) { router.back(); return; }
    setSaving(true);
    setMessage(null);
    let avatarSaved = false;
    try {
      if (avatarChanged) {
        const reply = character === 'sprout' ? await call('DELETE', '/api/me/avatar') : await call('PUT', '/api/me/avatar', { character });
        if (reply.status === 401) return;
        const next = reply.ok ? meOf(reply.body) : null;
        if (!next) { setMessage(`프로필 사진을 바꾸지 못했어요. ${errorMessage(reply.body) ?? '잠시 뒤 다시 해 주세요.'}`); return; }
        setMe(next);
        avatarSaved = true;
      }
      if (nameChanged) {
        const reply = await call('PUT', '/api/me/profile', { name: trimmed });
        if (reply.status === 401) {
          if (avatarSaved) showToast('프로필 사진은 바꿨어요. 닉네임은 다시 로그인한 뒤 바꿔 주세요.', true);
          return;
        }
        const next: Me | null = reply.ok ? meOf(reply.body) : null;
        if (!next) {
          const why = errorMessage(reply.body) ?? '잠시 뒤 다시 해 주세요.';
          if (avatarSaved) setCharacter(null);
          setMessage(avatarSaved ? `프로필 사진은 바꿨지만 닉네임을 바꾸지 못했어요. ${why}` : `닉네임을 바꾸지 못했어요. ${why}`);
          return;
        }
        setMe(next);
      }
      let done = '닉네임을 바꿨어요';
      if (avatarChanged && nameChanged) done = '프로필을 바꿨어요';
      else if (avatarChanged) done = '프로필 사진을 바꿨어요';
      showToast(done);
      router.back();
    } catch {
      setMessage(avatarSaved ? '프로필 사진은 바꿨지만 닉네임을 바꾸지 못했어요. 연결을 확인해 주세요.' : '바꾸지 못했어요. 연결을 확인해 주세요.');
    } finally {
      setSaving(false);
    }
  };

  const choiceOf = current === 'photo' && character === null;
  return (
    <BottomSheet still grabStart onClose={() => { if (!saving) router.back(); }}>
      <Pressable onPress={() => router.back()} disabled={saving} accessibilityRole="button" accessibilityLabel="닫기" style={styles.close}><CloseIcon color={theme.color.ink} /></Pressable>
      <ScrollView style={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.field}>
          <TextInput value={name} onChangeText={setName} maxLength={40} autoComplete="nickname" textContentType="nickname" returnKeyType="done"
            accessibilityLabel="닉네임" editable={!saving} style={styles.input} onSubmitEditing={() => void save()} />
          <Text style={[styles.count, count > NAME_MAX && styles.over]}>{`${count}/${NAME_MAX}`}</Text>
        </View>
        <View style={styles.pick}>
          <Text style={styles.label}>사진 · 캐릭터</Text>
          <View style={styles.choices} accessibilityRole="radiogroup" accessibilityLabel="프로필 사진 고르기">
            {choiceOf && <View style={[styles.choice, styles.chosen]}><AvatarFace avatar={me.avatar} size={56} /></View>}
            {CHARACTERS.map(([id, label]) => (
              <Pressable key={id} onPress={() => setCharacter(id)} disabled={saving} accessibilityRole="radio" accessibilityLabel={label}
                accessibilityState={{ checked: chosen === id }} style={[styles.choice, chosen === id && styles.chosen]}>
                <Image source={{ uri: faceUrl(id) }} style={styles.face} accessibilityIgnoresInvertColors />
              </Pressable>
            ))}
          </View>
          <Text style={styles.note}>사진 올리기는 웹에서 할 수 있어요.</Text>
        </View>
        <View style={styles.row}>
          <Pressable onPress={() => router.back()} disabled={saving} accessibilityRole="button" style={[styles.cancel, saving && styles.locked]}><Text style={styles.cancelText}>취소</Text></Pressable>
          <Pressable onPress={() => void save()} disabled={saving} accessibilityRole="button" accessibilityState={{ busy: saving }} style={[styles.save, saving && styles.locked]}><Text style={styles.saveText}>저장</Text></Pressable>
        </View>
        <Text style={styles.message} accessibilityLiveRegion="polite">{message}</Text>
      </ScrollView>
    </BottomSheet>
  );
}
