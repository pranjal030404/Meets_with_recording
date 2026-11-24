import 'package:flutter/material.dart';

/// Minutes design tokens: a neutral graphite ramp, one blue accent, hairline borders.
/// Mirrors the web app so both clients read as one product.
class AppTheme {
  static const brand = Color(0xFF3B82F6);

  // Dark ramp
  static const _dBg = Color(0xFF0E0F11);
  static const _dSurface = Color(0xFF141517);
  static const _dRaised = Color(0xFF1B1C1F);
  static const _dLine = Color(0x14FFFFFF);
  static const _dText = Color(0xFFEDEDEE);
  static const _dMuted = Color(0xFF9A9BA1);

  // Light ramp
  static const _lBg = Color(0xFFF7F7F8);
  static const _lSurface = Color(0xFFFFFFFF);
  static const _lRaised = Color(0xFFF0F0F2);
  static const _lLine = Color(0x14000000);
  static const _lText = Color(0xFF16171A);
  static const _lMuted = Color(0xFF6B6C73);

  /// Task / status colors (todo = slate, in progress = amber, done = green, overdue = red).
  static const todo = Color(0xFF94A3B8);
  static const inProgress = Color(0xFFF59E0B);
  static const done = Color(0xFF34D399);
  static const overdue = Color(0xFFF87171);

  static ThemeData build(Brightness b) {
    final dark = b == Brightness.dark;
    final bg = dark ? _dBg : _lBg;
    final surface = dark ? _dSurface : _lSurface;
    final raised = dark ? _dRaised : _lRaised;
    final line = dark ? _dLine : _lLine;
    final text = dark ? _dText : _lText;
    final muted = dark ? _dMuted : _lMuted;

    final scheme = ColorScheme.fromSeed(seedColor: brand, brightness: b).copyWith(
      primary: dark ? const Color(0xFF60A5FA) : const Color(0xFF2563EB),
      onPrimary: dark ? const Color(0xFF0B1220) : Colors.white,
      primaryContainer: dark ? const Color(0xFF1E3A5F) : const Color(0xFFDBEAFE),
      onPrimaryContainer: dark ? const Color(0xFFDBEAFE) : const Color(0xFF1E3A8A),
      surface: surface,
      onSurface: text,
      onSurfaceVariant: muted,
      outline: muted,
      outlineVariant: line,
      surfaceContainerLowest: bg,
      surfaceContainerLow: surface,
      surfaceContainer: surface,
      surfaceContainerHigh: raised,
      surfaceContainerHighest: raised,
      error: const Color(0xFFEF4444),
    );

    final radius = BorderRadius.circular(10);
    final hairline = BorderSide(color: line);

    return ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      scaffoldBackgroundColor: bg,
      dividerTheme: DividerThemeData(color: line, space: 1, thickness: 1),
      splashFactory: InkRipple.splashFactory,
      textTheme: Typography.material2021(platform: TargetPlatform.android)
          .black
          .apply(bodyColor: text, displayColor: text)
          .copyWith(
            titleLarge: TextStyle(fontSize: 20, fontWeight: FontWeight.w600, color: text),
            titleMedium: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: text),
            titleSmall: TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: muted),
          ),
      appBarTheme: AppBarTheme(
        centerTitle: false,
        elevation: 0,
        scrolledUnderElevation: 0,
        backgroundColor: bg,
        foregroundColor: text,
        surfaceTintColor: Colors.transparent,
        titleTextStyle: TextStyle(fontSize: 20, fontWeight: FontWeight.w600, color: text),
        shape: Border(bottom: hairline),
      ),
      navigationBarTheme: NavigationBarThemeData(
        height: 64,
        backgroundColor: surface,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        indicatorColor: raised,
        indicatorShape: RoundedRectangleBorder(borderRadius: radius),
        labelTextStyle: WidgetStateProperty.resolveWith((s) => TextStyle(
              fontSize: 12,
              fontWeight: s.contains(WidgetState.selected) ? FontWeight.w600 : FontWeight.w500,
              color: s.contains(WidgetState.selected) ? text : muted,
            )),
        iconTheme: WidgetStateProperty.resolveWith(
            (s) => IconThemeData(size: 22, color: s.contains(WidgetState.selected) ? text : muted)),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: raised,
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
        border: OutlineInputBorder(borderRadius: radius, borderSide: hairline),
        enabledBorder: OutlineInputBorder(borderRadius: radius, borderSide: hairline),
        focusedBorder: OutlineInputBorder(borderRadius: radius, borderSide: BorderSide(color: scheme.primary, width: 1.5)),
        errorBorder: OutlineInputBorder(borderRadius: radius, borderSide: BorderSide(color: scheme.error)),
        focusedErrorBorder: OutlineInputBorder(borderRadius: radius, borderSide: BorderSide(color: scheme.error, width: 1.5)),
        hintStyle: TextStyle(color: muted),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          minimumSize: const Size(0, 48),
          elevation: 0,
          textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
          shape: RoundedRectangleBorder(borderRadius: radius),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          minimumSize: const Size(0, 48),
          foregroundColor: text,
          side: hairline,
          shape: RoundedRectangleBorder(borderRadius: radius),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(shape: RoundedRectangleBorder(borderRadius: radius)),
      ),
      cardTheme: CardThemeData(
        elevation: 0,
        margin: const EdgeInsets.symmetric(vertical: 4),
        color: surface,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12), side: hairline),
      ),
      listTileTheme: ListTileThemeData(
        shape: RoundedRectangleBorder(borderRadius: radius),
        iconColor: muted,
      ),
      chipTheme: ChipThemeData(
        backgroundColor: raised,
        side: hairline,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
        labelStyle: TextStyle(fontSize: 12, fontWeight: FontWeight.w500, color: text),
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: surface,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16), side: hairline),
      ),
      bottomSheetTheme: BottomSheetThemeData(
        backgroundColor: surface,
        surfaceTintColor: Colors.transparent,
        shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(16))),
      ),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        backgroundColor: raised,
        contentTextStyle: TextStyle(color: text),
        shape: RoundedRectangleBorder(borderRadius: radius),
      ),
      progressIndicatorTheme: ProgressIndicatorThemeData(color: scheme.primary),
    );
  }
}
