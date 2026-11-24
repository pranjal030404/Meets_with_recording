import 'package:flutter_test/flutter_test.dart';
import 'package:meetclone/screens/meetings_screen.dart';

void main() {
  group('parseRoomId', () {
    test('returns plain codes untouched', () {
      expect(parseRoomId('abc-123'), 'abc-123');
    });
    test('extracts the code from an invite link', () {
      expect(parseRoomId('https://meet.example.com/meeting/xyz-789'), 'xyz-789');
    });
    test('ignores surrounding whitespace', () {
      expect(parseRoomId('  http://10.0.2.2:5000/meeting/r1  '), 'r1');
    });
    test('empty input gives empty id', () {
      expect(parseRoomId('   '), '');
    });
  });
}
