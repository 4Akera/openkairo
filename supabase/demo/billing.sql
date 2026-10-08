-- The billing pack's day (spec/openCare.md §5.1 rule 9, §5.4): its own three patients, each seen in General Practice this morning
-- with tests sent to the Laboratory. Magdy owes his visit, a blood count and an HbA1c (To pay); Hoda paid her visit and a lipid profile
-- at the Cashier, in cash (Paid today, her receipt); Waleed owes his visit and a lithium level priced At the order, which the cashier
-- prices on the payment card. Times relative to the load; ids in the pack's namespace; a reload erases these patients first (their
-- payments keep their amounts and receipt numbers and lose the patient, as an Erase leaves them, §5.4).

select demo.layer('billing');

do $$
declare v uuid; lab uuid := demo.base('lab');
begin
  -- a diabetic's three-monthly check: seen, his blood count and HbA1c sent; he has not paid yet
  perform demo.patient(demo.id('billing', 'patient:magdy'), array['Magdy', 'Fouad'], 'Rizk', 'male', demo.born(58, 40), '+201006632170');
  v := demo.arrive('diabetes check, three-monthly', 75);
  perform demo.consult(v, 60, jsonb_build_array(
    demo.gp('vitals', v, 58, demo.vitals(138, 86, 80, 36.9, 98, 16, 92)),
    demo.gp('problem', v, 56, demo.problem('E11.9', 'Type 2 diabetes mellitus')),
    demo.lab_order('cbc', demo.base('gp'), v, demo.ago(55), demo.id('billing', 'order:magdy cbc')),
    demo.lab_order('hba1c', demo.base('gp'), v, demo.ago(55), demo.id('billing', 'order:magdy hba1c'))), 50);

  -- blood pressure follow-up early this morning: her lipid profile sent; she paid at the Cashier on her way out (below)
  perform demo.patient(demo.id('billing', 'patient:hoda'), array['Hoda', 'Samy'], 'Bakr', 'female', demo.born(63, 115), '+201227741508');
  v := demo.arrive('blood pressure follow-up', 230);
  perform demo.consult(v, 215, jsonb_build_array(
    demo.gp('vitals', v, 213, demo.vitals(146, 88, 74, 36.6, 97, 16, 81)),
    demo.gp('problem', v, 211, demo.problem('I10', 'Essential hypertension')),
    demo.lab_order('lipids', demo.base('gp'), v, demo.ago(210), demo.id('billing', 'order:hoda lipids'))), 205);

  -- on lithium for years: his level is a send-out, priced At the order (the cashier types it)
  perform demo.patient(demo.id('billing', 'patient:waleed'), array['Waleed', 'Hassan'], 'Ezzat', 'male', demo.born(41, 260), '+201113350284');
  v := demo.arrive('lithium level due', 45);
  perform demo.consult(v, 30, jsonb_build_array(
    demo.gp('problem', v, 28, demo.problem('F31.9', 'Bipolar affective disorder')),
    demo.lab_order('lithium', demo.base('gp'), v, demo.ago(27), demo.id('billing', 'order:waleed lithium'))), 25);
end $$;

-- billing hears the visits and orders after commit (its listener); the demo runs that background work now, as the job would, so the
-- Cashier can take Hoda's payment in the same load
select core.drain() as drained;

-- Hoda pays her visit and lipid profile in cash at the Cashier, through the pack's door as the payment card writes it
do $$
declare c uuid := demo.id('billing', 'cashier'); l jsonb; v_total numeric;
begin
  perform demo.as(demo.id('billing', 'cashier person'));
  l := public.pack_op(jsonb_build_object('op', 'billing.lines', 'department_id', c, 'args', jsonb_build_object('patient_id', demo.id('billing', 'patient:hoda'))));
  select sum((x ->> 'amount')::numeric) into v_total from jsonb_array_elements(l -> 'charges') x;
  perform public.pack_op(jsonb_build_object('op', 'billing.pay', 'department_id', c, 'args', jsonb_build_object('patient_id', demo.id('billing', 'patient:hoda'),
    'method', 'cash', 'total', v_total::text, 'received', (ceil(v_total / 100) * 100)::text,
    'charges', (select jsonb_agg(jsonb_build_object('item', x ->> 'item', 'department_id', x ->> 'department_id')) from jsonb_array_elements(l -> 'charges') x))));
end $$;
