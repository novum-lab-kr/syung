"""슝 서버 패키지. 층: app → routes → services → sources · store (jobs 는 services 를 부른다).

공용 leaf: config(환경 변수) · errors(밖으로 나가는 오류 코드) · clock(KST 날짜 · 시각).
이 파일은 아무것도 import 하지 않는다(진입점 · 테스트가 패키지만 읽어도 서버가 뜨지 않게).
"""
