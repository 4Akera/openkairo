-- the pharmacy pack's dispense answers prescriptions (its own registry row): core finds the dispensing service by this, not by the pack's name
update core.entry_types set answers = 'prescription' where key = 'pharmacy_dispense' and pack = 'pharmacy';
