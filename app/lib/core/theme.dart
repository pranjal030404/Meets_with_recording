import 'package:flutter/material.dart';

/// Minutes design tokens: a neutral graphite ramp, one blue accent, hairline borders.
/// Mirrors the web app so both clients read as one product.
class AppTheme {
  // Tokens from the web landing page (frontend/src/pages/landing.css): warm graphite,
  // off-white primary actions, one amber accent.
  static const bg = Color(0xFF121110);
  static const surface = Color(0xFF1A1917);
  static const raised = Color(0xFF211F1D);
  static const line = Color(0x1AF2EEE8);
  static const text = Color(0xFFF2EEE8);
  static const muted = Color(0xFFA8A299);
  static const faint = Color(0xFF8A847B);
  static const button = text;
  static const buttonInk = Color(0xFF17140F);
  static const accent = Color(0xFFE8A33D);
  static const accentInk = Color(0xFF1A1307);

  static const display = 'Manrope';

  /// Task / status colors (todo = slate, in progress = amber, done = green, overdue = red).
  static const todo = muted;
  static const inProgress = accent;
  static const done = Color(0xFF6FBF8E);
  static const overdue = Color(0xFFE5484D);

  /// The web app is dark only, so the mobile app is too.
  static ThemeData build() {
    final scheme = ColorScheme.fromSeed(seedColor: accent, brightness: Brightness.dark).copyWith(
      primary: button,
      onPrimary: buttonInk,
      primaryContainer: const Color(0xFF2E2A26),
      onPrimaryContainer: text,
      secondary: accent,
      onSecondary: accentInk,
      secondaryContainer: const Color(0xFF2E2A26),
      onSecondaryContainer: text,
      tertiary: accent,
      onTertiary: accentInk,
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
      error: const Color(0xFFE5484D),
    );

    final radius = BorderRadius.circular(8);
    final hairline = BorderSide(color: line);

    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      fontFamily: 'Manrope',
      colorScheme: scheme,
      scaffoldBackgroundColor: bg,
      dividerTheme: DividerThemeData(color: line, space: 1, thickness: 1),
      splashFactory: InkRipple.splashFactory,
      textTheme: Typography.material2021(platform: TargetPlatform.android)
          .white
          .apply(fontFamily: 'Manrope', bodyColor: text, displayColor: text)
          .copyWith(
            titleLarge: const TextStyle(fontFamily: display, fontSize: 20, fontWeight: FontWeight.w500, color: text),
            titleMedium: const TextStyle(fontFamily: 'Manrope', fontSize: 16, fontWeight: FontWeight.w600, color: text),
            titleSmall: const TextStyle(fontFamily: 'Manrope', fontSize: 14, fontWeight: FontWeight.w500, color: muted),
          ),
      appBarTheme: AppBarTheme(
        centerTitle: false,
        elevation: 0,
        scrolledUnderElevation: 0,
        backgroundColor: bg,
        foregroundColor: text,
        surfaceTintColor: Colors.transparent,
        titleTextStyle: const TextStyle(fontFamily: display, fontSize: 20, fontWeight: FontWeight.w500, color: text),
        shape: Border(bottom: hairline),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: raised,
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
        border: OutlineInputBorder(borderRadius: radius, borderSide: hairline),
        enabledBorder: OutlineInputBorder(borderRadius: radius, borderSide: hairline),
        focusedBorder: OutlineInputBorder(borderRadius: radius, borderSide: const BorderSide(color: accent, width: 1.5)),
        errorBorder: OutlineInputBorder(borderRadius: radius, borderSide: BorderSide(color: scheme.error)),
        focusedErrorBorder: OutlineInputBorder(borderRadius: radius, borderSide: BorderSide(color: scheme.error, width: 1.5)),
        hintStyle: const TextStyle(color: faint, fontSize: 14),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          minimumSize: const Size(0, 48),
          elevation: 0,
          textStyle: const TextStyle(fontFamily: 'Manrope', fontSize: 15, fontWeight: FontWeight.w500),
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
        style: TextButton.styleFrom(foregroundColor: accent, shape: RoundedRectangleBorder(borderRadius: radius)),
      ),
      floatingActionButtonTheme: FloatingActionButtonThemeData(
        backgroundColor: button,
        foregroundColor: buttonInk,
        elevation: 0,
        shape: RoundedRectangleBorder(borderRadius: radius),
      ),
      drawerTheme: const DrawerThemeData(backgroundColor: surface, surfaceTintColor: Colors.transparent, shape: RoundedRectangleBorder()),
      segmentedButtonTheme: SegmentedButtonThemeData(style: SegmentedButton.styleFrom(shape: RoundedRectangleBorder(borderRadius: radius))),
      cardTheme: CardThemeData(
        elevation: 0,
        margin: const EdgeInsets.symmetric(vertical: 4),
        color: surface,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14), side: hairline),
      ),
      listTileTheme: ListTileThemeData(
        shape: RoundedRectangleBorder(borderRadius: radius),
        iconColor: muted,
      ),
      chipTheme: ChipThemeData(
        backgroundColor: raised,
        side: hairline,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
        labelStyle: TextStyle(fontFamily: 'Manrope', fontSize: 12, fontWeight: FontWeight.w500, color: text),
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: surface,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14), side: hairline),
      ),
      bottomSheetTheme: BottomSheetThemeData(
        backgroundColor: surface,
        surfaceTintColor: Colors.transparent,
        shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(14))),
      ),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        backgroundColor: raised,
        contentTextStyle: const TextStyle(fontFamily: 'Manrope', color: text),
        shape: RoundedRectangleBorder(borderRadius: radius),
      ),
      progressIndicatorTheme: ProgressIndicatorThemeData(color: scheme.primary),
    );
  }
}
