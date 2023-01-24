yum install -y awscli jq
aws configure set region `curl --silent http://169.254.169.254/latest/dynamic/instance-identity/document | jq -r .region`

cat > /root/queueProcessor.sh << EOF
#!/bin/bash
aws configure set region `curl --silent http://169.254.169.254/latest/dynamic/instance-identity/document | jq -r .region`

queue2=\$(aws ssm get-parameter --name _QUEUE2_URL_PARAMETER_ | jq -r '.Parameter.Value');

while sleep 60;
do

echo "Looking for a message";
message=\$(aws sqs receive-message --queue-url \$queue2)

if [[ -z \$message ]]
then
  echo "No new messages";
else
  echo "Found a message";
  echo \$message;
fi

done;

EOF

chmod +x /root/queueProcessor.sh

cat > /etc/systemd/system/queue-processor.service << EOF
[Unit]
Description = sqs processor
After = network.target

[Service]
ExecStart = /root/queueProcessor.sh

EOF

cd /etc/systemd/system
systemctl enable queue-processor.service
systemctl start queue-processor.service