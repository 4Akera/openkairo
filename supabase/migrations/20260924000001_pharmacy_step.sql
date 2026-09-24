-- pharmacy pack · its request step, in a file of its own (spec 06: ADD VALUE gets its own file)
alter type core.request_step add value if not exists 'prepared';
