// 데이터 출처 쪽: web/index.html #menuSources 글 그대로 + syung.css .source-list.
import { Fragment, type ReactNode } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { tokens } from '../../theme/tokens';
import { useTheme, type Theme } from '../../theme/useTheme';

const open = (url: string) => { Linking.openURL(url).catch(() => undefined); };

function Link({ theme, url, children }: { theme: Theme; url: string; children: string }) {
  return <Text accessibilityRole="link" onPress={() => open(url)} style={[styles.link, { color: theme.color.ink }]}>{children}</Text>;
}

export function Sources() {
  const theme = useTheme();
  const rows: { title: string; body: ReactNode; link?: [string, string] }[] = [
    { title: '노선 · 역 · 시간표', body: 'KTDB(국가교통DB, 한국교통연구원) 대중교통 GTFS', link: ['ktdb.go.kr', 'https://www.ktdb.go.kr/'] },
    { title: '실시간 열차 위치 · 도착', body: '서울특별시 열린데이터광장 지하철 실시간 도착 · 위치 정보', link: ['data.seoul.go.kr', 'https://data.seoul.go.kr/'] },
    { title: '버스 노선 · 정류장', body: '서울특별시 열린데이터광장 버스 노선 · 정류소 정보 · 공공누리 제1유형(출처표시)', link: ['data.seoul.go.kr', 'https://data.seoul.go.kr/'] },
    { title: '실시간 버스 위치 · 도착', body: '서울특별시 버스 정보 API(ws.bus.go.kr)' },
    { title: '날씨', body: '기상청 단기예보 조회서비스(공공데이터포털) 초단기실황 · 초단기예보 · 공공누리 제1유형(출처표시)', link: ['data.go.kr', 'https://www.data.go.kr/data/15084084/openapi.do'] },
    {
      title: '배경 지도 · 선로',
      body: <Fragment><Link theme={theme} url="https://openmaptiles.org/">© OpenMapTiles</Link>{' · '}<Link theme={theme} url="https://www.openstreetmap.org/copyright">© OpenStreetMap</Link>{' 기여자(ODbL) · 지도 타일 OpenFreeMap'}</Fragment>,
    },
  ];
  const text = { color: theme.color.secondary, fontFamily: theme.font.body };
  return (
    <View style={styles.list}>
      {rows.map((row, index) => (
        <View key={row.title} style={[styles.row, index < rows.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.color.rule }]}>
          <Text style={[styles.title, { color: theme.color.ink, fontFamily: theme.font.body }]}>{row.title}</Text>
          <Text style={[styles.body, text]}>{row.body}</Text>
          {row.link ? <Text style={[styles.body, text]}><Link theme={theme} url={row.link[1]}>{row.link[0]}</Link></Text> : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: 10 },
  row: { gap: 2, paddingVertical: tokens.space[3] },
  title: { fontSize: tokens.text[15], lineHeight: 22.5, fontWeight: tokens.weight.bold },
  body: { fontSize: tokens.text[14], lineHeight: 21 },
  link: { textDecorationLine: 'underline' },
});
