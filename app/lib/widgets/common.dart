import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../core/api.dart';
import '../core/config.dart';

void toast(BuildContext context, String msg, {bool error = false}) {
  if (!context.mounted) return;
  final m = ScaffoldMessenger.of(context);
  m.hideCurrentSnackBar();
  m.showSnackBar(SnackBar(
    content: Text(msg),
    behavior: SnackBarBehavior.floating,
    backgroundColor: error ? Theme.of(context).colorScheme.error : null,
    showCloseIcon: false,
  ));
}

String errMsg(Object e) => e is ApiException ? e.message : e.toString().replaceFirst('Exception: ', '');

/// Run an API action, surfacing failures as a snackbar. Returns null on failure.
Future<T?> guard<T>(BuildContext context, Future<T> Function() action, {String? success}) async {
  try {
    final r = await action();
    if (success != null && context.mounted) toast(context, success);
    return r;
  } catch (e) {
    if (context.mounted) toast(context, errMsg(e), error: true);
    return null;
  }
}

class UserAvatar extends StatelessWidget {
  final String? name;
  final String? url;
  final double radius;
  const UserAvatar({super.key, this.name, this.url, this.radius = 20});

  @override
  Widget build(BuildContext context) {
    final resolved = Config.resolveUrl(url);
    final initial = (name ?? '?').trim().isEmpty ? '?' : name!.trim()[0].toUpperCase();
    final cs = Theme.of(context).colorScheme;
    return CircleAvatar(
      radius: radius,
      backgroundColor: cs.primaryContainer,
      foregroundImage: resolved != null ? NetworkImage(resolved) : null,
      onForegroundImageError: resolved != null ? (_, __) {} : null,
      child: Text(initial, style: TextStyle(color: cs.onPrimaryContainer, fontSize: radius * 0.8, fontWeight: FontWeight.w600)),
    );
  }
}

/// Loads data once, with pull-to-refresh, error + empty states.
class AsyncList<T> extends StatefulWidget {
  final Future<List<T>> Function() load;
  final Widget Function(BuildContext, T, Future<void> Function() reload) itemBuilder;
  final String emptyText;
  final IconData emptyIcon;
  final EdgeInsets padding;
  final Widget? header;
  const AsyncList({
    super.key,
    required this.load,
    required this.itemBuilder,
    this.emptyText = 'Nothing here yet',
    this.emptyIcon = Icons.inbox_outlined,
    this.padding = const EdgeInsets.fromLTRB(12, 8, 12, 96),
    this.header,
  });
  @override
  State<AsyncList<T>> createState() => AsyncListState<T>();
}

class AsyncListState<T> extends State<AsyncList<T>> {
  List<T>? items;
  String? error;
  bool loading = true;

  @override
  void initState() {
    super.initState();
    reload();
  }

  Future<void> reload() async {
    try {
      final r = await widget.load();
      if (!mounted) return;
      setState(() {
        items = r;
        error = null;
        loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        error = errMsg(e);
        loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (loading) return const Center(child: CircularProgressIndicator());
    if (error != null && items == null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Icon(Icons.cloud_off, size: 48, color: Theme.of(context).colorScheme.outline),
            const SizedBox(height: 12),
            Text(error!, textAlign: TextAlign.center),
            const SizedBox(height: 12),
            FilledButton.tonal(onPressed: () { setState(() => loading = true); reload(); }, child: const Text('Retry')),
          ]),
        ),
      );
    }
    final list = items ?? [];
    return RefreshIndicator(
      onRefresh: reload,
      child: list.isEmpty
          ? ListView(children: [
              if (widget.header != null) widget.header!,
              SizedBox(
                height: 320,
                child: Center(
                  child: Column(mainAxisSize: MainAxisSize.min, children: [
                    Icon(widget.emptyIcon, size: 56, color: Theme.of(context).colorScheme.outline),
                    const SizedBox(height: 8),
                    Text(widget.emptyText, style: TextStyle(color: Theme.of(context).colorScheme.outline)),
                  ]),
                ),
              ),
            ])
          : ListView.builder(
              padding: widget.padding,
              itemCount: list.length + (widget.header != null ? 1 : 0),
              itemBuilder: (c, i) {
                if (widget.header != null) {
                  if (i == 0) return widget.header!;
                  i--;
                }
                return widget.itemBuilder(c, list[i], reload);
              },
            ),
    );
  }
}

DateTime? parseDate(dynamic v) => v == null ? null : DateTime.tryParse(v.toString())?.toLocal();

String fmtDateTime(dynamic v) {
  final d = parseDate(v);
  return d == null ? '' : DateFormat('EEE, MMM d · h:mm a').format(d);
}

String fmtTime(DateTime d) => DateFormat('h:mm a').format(d);

String fmtRelative(dynamic v) {
  final d = parseDate(v);
  if (d == null) return '';
  final diff = DateTime.now().difference(d);
  if (diff.inMinutes < 1) return 'now';
  if (diff.inHours < 1) return '${diff.inMinutes}m';
  if (diff.inDays < 1) return DateFormat('h:mm a').format(d);
  if (diff.inDays < 7) return DateFormat('EEE').format(d);
  return DateFormat('MMM d').format(d);
}

String fmtBytes(dynamic n) {
  final b = (n is num) ? n.toDouble() : double.tryParse('$n') ?? 0;
  if (b < 1024) return '${b.toInt()} B';
  if (b < 1024 * 1024) return '${(b / 1024).toStringAsFixed(1)} KB';
  if (b < 1024 * 1024 * 1024) return '${(b / 1024 / 1024).toStringAsFixed(1)} MB';
  return '${(b / 1024 / 1024 / 1024).toStringAsFixed(2)} GB';
}

Future<String?> promptText(BuildContext context, String title, {String? hint, String initial = '', String ok = 'OK', bool multiline = false}) {
  final c = TextEditingController(text: initial);
  return showDialog<String>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: Text(title),
      content: TextField(controller: c, autofocus: true, maxLines: multiline ? 4 : 1, minLines: 1, decoration: InputDecoration(hintText: hint)),
      actions: [
        TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
        FilledButton(onPressed: () => Navigator.pop(ctx, c.text.trim()), child: Text(ok)),
      ],
    ),
  );
}

Future<bool> confirm(BuildContext context, String title, {String? body, String ok = 'Confirm', bool danger = false}) async {
  final r = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: Text(title),
      content: body == null ? null : Text(body),
      actions: [
        TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
        FilledButton(
          style: danger ? FilledButton.styleFrom(backgroundColor: Theme.of(ctx).colorScheme.error) : null,
          onPressed: () => Navigator.pop(ctx, true),
          child: Text(ok),
        ),
      ],
    ),
  );
  return r ?? false;
}

class SectionTitle extends StatelessWidget {
  final String text;
  const SectionTitle(this.text, {super.key});
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(4, 16, 4, 6),
        child: Text(text, style: Theme.of(context).textTheme.titleSmall?.copyWith(color: Theme.of(context).colorScheme.outline, fontWeight: FontWeight.w600)),
      );
}

List<dynamic> asList(dynamic v) => v is List ? v : const [];
Map<String, dynamic> asMap(dynamic v) => v is Map ? Map<String, dynamic>.from(v) : <String, dynamic>{};
