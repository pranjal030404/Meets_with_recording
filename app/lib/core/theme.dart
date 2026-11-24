import 'package:flutter/material.dart';

class AppTheme {
  static const brand = Color(0xFF5B6CFF);

  static ThemeData build(Brightness b) {
    final scheme = ColorScheme.fromSeed(seedColor: brand, brightness: b);
    return ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      scaffoldBackgroundColor: b == Brightness.dark ? const Color(0xFF0E1018) : null,
      appBarTheme: const AppBarTheme(centerTitle: false, scrolledUnderElevation: 0),
      inputDecorationTheme: InputDecorationTheme(
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
        filled: true,
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          minimumSize: const Size(0, 48),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ),
      ),
      cardTheme: CardThemeData(
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(14),
          side: BorderSide(color: scheme.outlineVariant),
        ),
      ),
    );
  }
}
