import 'package:flutter/material.dart';
import '../core/api.dart';
import '../widgets/common.dart';

class BillingScreen extends StatefulWidget {
  const BillingScreen({super.key});
  @override
  State<BillingScreen> createState() => _BillingScreenState();
}

class _BillingScreenState extends State<BillingScreen> {
  Map<String, dynamic>? me;
  List<Map<String, dynamic>> plans = [];
  List<Map<String, dynamic>> payments = [];
  String interval = 'monthly';
  bool loading = true;
  String? error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final r = await Future.wait([
        Api.instance.get('/subscriptions/plans'),
        Api.instance.get('/subscriptions/me'),
        Api.instance.get('/subscriptions/payments').catchError((_) => {'data': {'payments': []}}),
      ]);
      if (!mounted) return;
      setState(() {
        plans = asList(Api.unwrap(r[0])['plans']).map(asMap).toList();
        me = asMap(Api.unwrap(r[1]));
        payments = asList(Api.unwrap(r[2])['payments']).map(asMap).toList();
        loading = false;
      });
    } catch (e) {
      if (mounted) setState(() { error = errMsg(e); loading = false; });
    }
  }

  String get currentSlug => asMap(me?['plan'])['slug']?.toString() ?? asMap(asMap(me?['subscription'])['plan'])['slug']?.toString() ?? 'free';

  Future<void> _subscribe(Map<String, dynamic> p) async {
    if (!await confirm(context, 'Switch to ${p['name']}?', body: 'Billing: $interval', ok: 'Confirm')) return;
    if (!mounted) return;
    final r = await guard(context, () => Api.instance.post('/subscriptions/subscribe', {'planSlug': p['slug'], 'billingInterval': interval}), success: 'Plan updated');
    if (r != null) _load();
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final sub = asMap(me?['subscription']);
    final usage = asMap(me?['usage']);
    return Scaffold(
      appBar: AppBar(title: const Text('Plan & billing')),
      body: loading
          ? const Center(child: CircularProgressIndicator())
          : error != null
              ? Center(child: Text(error!))
              : RefreshIndicator(
                  onRefresh: _load,
                  child: ListView(padding: const EdgeInsets.all(16), children: [
                    Card(
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text('Current plan', style: TextStyle(color: cs.outline)),
                          Text((asMap(sub['plan'])['name'] ?? currentSlug).toString(), style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w700)),
                          if (sub['status'] != null) Text('Status: ${sub['status']}${sub['cancelAtPeriodEnd'] == true ? ' (cancels at period end)' : ''}'),
                          if (usage.isNotEmpty) ...[
                            const Divider(height: 24),
                            ...usage.entries.where((e) => e.value is num).map((e) => Padding(padding: const EdgeInsets.symmetric(vertical: 2), child: Row(children: [Expanded(child: Text(e.key)), Text('${e.value}')]))),
                          ],
                          if (currentSlug != 'free')
                            Row(children: [
                              if (sub['cancelAtPeriodEnd'] == true)
                                TextButton(onPressed: () async { await guard(context, () => Api.instance.post('/subscriptions/resume'), success: 'Subscription resumed'); _load(); }, child: const Text('Resume'))
                              else
                                TextButton(
                                  onPressed: () async {
                                    if (await confirm(context, 'Cancel subscription?', ok: 'Cancel plan', danger: true) && mounted) {
                                      await guard(context, () => Api.instance.post('/subscriptions/cancel'), success: 'Subscription will cancel at period end');
                                      _load();
                                    }
                                  },
                                  child: const Text('Cancel plan'),
                                ),
                            ]),
                        ]),
                      ),
                    ),
                    const SizedBox(height: 12),
                    Center(child: SegmentedButton<String>(segments: const [ButtonSegment(value: 'monthly', label: Text('Monthly')), ButtonSegment(value: 'yearly', label: Text('Yearly'))], selected: {interval}, onSelectionChanged: (s) => setState(() => interval = s.first))),
                    const SizedBox(height: 12),
                    ...plans.map((p) {
                      final price = interval == 'monthly' ? p['monthlyPrice'] : p['yearlyPrice'];
                      final current = p['slug'] == currentSlug;
                      final features = asList(p['features']);
                      return Card(
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14), side: BorderSide(color: current ? cs.primary : cs.outlineVariant, width: current ? 2 : 1)),
                        child: Padding(
                          padding: const EdgeInsets.all(16),
                          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            Row(children: [
                              Expanded(child: Text(p['name'].toString(), style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700))),
                              Text('${p['currency'] ?? 'USD'} $price/${interval == 'monthly' ? 'mo' : 'yr'}', style: const TextStyle(fontWeight: FontWeight.w600)),
                            ]),
                            if ((p['description'] ?? '').toString().isNotEmpty) Text(p['description'].toString(), style: TextStyle(color: cs.outline)),
                            const SizedBox(height: 8),
                            ...features.map((f) => Row(children: [const Icon(Icons.check, size: 16, color: Colors.green), const SizedBox(width: 6), Expanded(child: Text(f.toString()))])),
                            const SizedBox(height: 10),
                            SizedBox(width: double.infinity, child: current ? const Chip(label: Text('Current plan')) : FilledButton.tonal(onPressed: () => _subscribe(p), child: Text('Choose ${p['name']}'))),
                          ]),
                        ),
                      );
                    }),
                    if (payments.isNotEmpty) ...[
                      const SectionTitle('Payment history'),
                      ...payments.map((p) => ListTile(dense: true, title: Text('${p['currency'] ?? ''} ${p['amount']}'), subtitle: Text(fmtDateTime(p['createdAt'])), trailing: Text((p['status'] ?? '').toString()))),
                    ],
                  ]),
                ),
    );
  }
}
